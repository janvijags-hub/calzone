// Video sources. The rest of the app only needs "a <video> that is playing".
//   useCamera  - a camera the browser can see (the MacBook camera)
//   useRelay   - Meta glasses: an iPhone app sends pictures to server.py, we pull them here
//   useWindow  - share a window (for example a video call coming from the glasses)

let relay = null; // stops the relay loop when the source changes

export async function listCameras() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput');
  } catch {
    return [];
  }
}

export function stop(video) {
  if (relay) { relay.abort(); relay = null; }
  const s = video.srcObject;
  if (s) s.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

export async function useStream(video, stream) {
  stop(video);
  video.srcObject = stream;
  await video.play();
}

export async function useCamera(video, deviceId) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 }, height: { ideal: 720 },
    },
  });
  await useStream(video, stream);
}

export async function useWindow(video) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
  await useStream(video, stream);
}

// Glasses relay. Each picture from the phone is painted on a hidden canvas, and
// the canvas is turned into a live video stream, so tracking works as usual.
export function useRelay(video) {
  stop(video);
  const ctl = relay = new AbortController();
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 360;
  const ctx = canvas.getContext('2d');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  (async () => {
    let id = 0;
    while (!ctl.signal.aborted) {
      try {
        const r = await fetch(`/glasses/frame?after=${id}`, { signal: ctl.signal });
        if (r.status === 200) {
          id = Number(r.headers.get('X-Frame-Id'));
          const pic = await createImageBitmap(await r.blob());
          if (canvas.width !== pic.width || canvas.height !== pic.height) {
            canvas.width = pic.width; canvas.height = pic.height;
          }
          ctx.drawImage(pic, 0, 0);
          pic.close();
        } else if (r.status !== 204) await wait(1000); // 204 = no new picture yet
      } catch {
        if (!ctl.signal.aborted) await wait(1000);
      }
    }
  })();

  video.srcObject = canvas.captureStream(30);
  video.play().catch(() => {}); // starts once the first picture arrives
}

export async function relayInfo() {
  try {
    const r = await fetch('/glasses/info');
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
