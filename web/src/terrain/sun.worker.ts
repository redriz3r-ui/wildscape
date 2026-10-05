import { analyzeSun, type SunGrid } from "./sun";
self.onmessage = (event: MessageEvent<SunGrid>) => {
  const result = analyzeSun(event.data);
  self.postMessage(result, { transfer: [result.bytes.buffer] });
};
