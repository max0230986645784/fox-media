const THUMBNAIL_WIDTH = 480;

export interface Thumbnail {
  cover: string;
  duration: number;
}

/** Grabs a frame a few seconds into a video and returns it as a JPEG data URL. */
export function captureThumbnail(url: string): Promise<Thumbnail> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    const fail = (reason: string) => {
      video.removeAttribute('src');
      video.load();
      reject(new Error(reason));
    };

    video.onerror = () => fail('lecture impossible');
    video.onloadedmetadata = () => {
      const target = Number.isFinite(video.duration)
        ? Math.min(Math.max(video.duration * 0.1, 1), 20)
        : 1;
      video.currentTime = target;
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const ratio = video.videoHeight / video.videoWidth || 0.5625;
      canvas.width = THUMBNAIL_WIDTH;
      canvas.height = Math.round(THUMBNAIL_WIDTH * ratio);
      const context = canvas.getContext('2d');
      if (!context) {
        fail('canvas indisponible');
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const cover = canvas.toDataURL('image/jpeg', 0.72);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.removeAttribute('src');
      video.load();
      resolve({ cover, duration });
    };

    video.src = url;
  });
}
