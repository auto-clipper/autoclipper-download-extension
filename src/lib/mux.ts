import MP4Box from 'mp4box';

/**
 * Mux a video-only MP4 and an audio-only MP4 (Reddit's DASH/CMAF fallback
 * tracks) into a single progressive MP4, entirely in memory. Verified
 * against real v.redd.it tracks with ffprobe/ffmpeg (see tests/mux.test.ts).
 *
 * Throws on unsupported inputs — callers fall back to separate downloads.
 */
export async function muxVideoAndAudio(
  videoBuffer: ArrayBuffer,
  audioBuffer: ArrayBuffer,
): Promise<ArrayBuffer> {
  const video = await parseTrack(videoBuffer);
  const audio = await parseTrack(audioBuffer);

  const out = MP4Box.createFile();
  addTrackFrom(video, out);
  addTrackFrom(audio, out);

  const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
  out.write(stream);
  return stream.buffer;
}

interface ParsedTrack {
  file: any;
  info: any;
  samples: any[];
}

function parseTrack(buffer: ArrayBuffer): Promise<ParsedTrack> {
  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile();
    const samples: any[] = [];
    let info: any = null;
    let settled = false;

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    file.onError = (e: unknown) => settle(() => reject(new Error(`mp4box: ${String(e)}`)));
    file.onReady = (i: any) => {
      info = i;
      if (!i.tracks?.length) {
        settle(() => reject(new Error('mp4box: no tracks in input')));
        return;
      }
      file.setExtractionOptions(i.tracks[0].id, null, { nbSamples: Infinity });
      file.start();
    };
    file.onSamples = (_id: number, _user: unknown, newSamples: any[]) => {
      samples.push(...newSamples);
      if (info && samples.length >= info.tracks[0].nb_samples) {
        settle(() => resolve({ file, info, samples }));
      }
    };

    // mp4box requires a fileStart marker on the buffer
    (buffer as any).fileStart = 0;
    file.appendBuffer(buffer);
    file.flush();

    // mp4box parses synchronously on append; if the moov never showed up it
    // silently waits forever — turn that into an error.
    if (!info) {
      settle(() => reject(new Error('mp4box: could not parse input (no moov)')));
    }
    // Safety net for a sample-extraction stall.
    setTimeout(
      () => settle(() => reject(new Error('mp4box: sample extraction timed out'))),
      15_000,
    );
  });
}

function addTrackFrom(src: ParsedTrack, out: any): void {
  const trak = src.file.moov.traks[0];
  const info = src.info.tracks[0];
  const entry = trak.mdia.minf.stbl.stsd.entries[0];

  const opts: Record<string, unknown> = {
    timescale: info.timescale,
    duration: info.duration,
    media_duration: info.duration,
    language: info.language,
  };

  if (info.type === 'video') {
    const cfgBox = entry.avcC ?? entry.hvcC;
    if (!cfgBox) throw new Error('mux: unsupported video codec (no avcC/hvcC)');
    const ds = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
    cfgBox.write(ds);
    Object.assign(opts, {
      type: entry.type,
      width: info.video.width,
      height: info.video.height,
      // Serialized config box minus its 8-byte box header
      avcDecoderConfigRecord: ds.buffer.slice(8),
    });
  } else if (info.type === 'audio') {
    Object.assign(opts, {
      type: entry.type,
      hdlr: 'soun',
      channel_count: info.audio.channel_count,
      samplerate: info.audio.sample_rate,
      samplesize: info.audio.sample_size,
    });
  } else {
    throw new Error(`mux: unsupported track type ${info.type}`);
  }

  const trackId = out.addTrack(opts);

  // Carry the AAC decoder config (esds) over to the new sample entry.
  if (info.type === 'audio' && entry.esds) {
    const newTrak = out.moov.traks.find((t: any) => t.tkhd.track_id === trackId);
    const newEntry = newTrak.mdia.minf.stbl.stsd.entries[0];
    if (typeof newEntry.addBox === 'function') {
      newEntry.addBox(entry.esds);
    } else {
      newEntry.boxes = [entry.esds];
      newEntry.esds = entry.esds;
    }
  }

  for (const s of src.samples) {
    out.addSample(trackId, s.data, {
      duration: s.duration,
      cts: s.cts,
      dts: s.dts,
      is_sync: s.is_sync,
    });
  }
}
