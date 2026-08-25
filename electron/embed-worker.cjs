/**
 * Embedding worker thread.
 * Loads the local ONNX embedding model (BAAI/bge-large-zh-v1.5) and runs
 * inference off the main process thread. onnxruntime-node's run() executes
 * synchronously on the calling thread, so running it in a worker keeps the
 * Electron main process event loop free (CDP/IPC stay responsive).
 */

const { parentPort, workerData } = require('worker_threads');

let pipe = null;
let loadError = null;

async function loadModel() {
  const transformers = require('@huggingface/transformers');
  transformers.env.localModelPath = workerData.modelPath;
  transformers.env.allowRemoteModels = false;

  pipe = await transformers.pipeline('feature-extraction', workerData.modelName, {
    device: 'cpu',
    dtype: 'fp32',
  });

  // BGE tokenizer_config.json ships model_max_length=1e30, which disables
  // truncation and crashes the ONNX Expand node ("invalid expand shape") on
  // long inputs. Force 512 so truncation actually applies.
  pipe.tokenizer._tokenizerConfig.model_max_length = 512;
}

parentPort.on('message', async (msg) => {
  if (msg.type !== 'embed') return;
  try {
    if (!pipe) {
      if (loadError) throw loadError;
      await loadModel();
    }
    const output = await pipe(msg.texts, { pooling: 'mean', normalize: true });
    const dims = output.dims;
    const data = output.data;
    const vectors = [];
    for (let i = 0; i < dims[0]; i++) {
      vectors.push(Array.prototype.slice.call(data, i * dims[1], (i + 1) * dims[1]));
    }
    parentPort.postMessage({ type: 'result', id: msg.id, vectors });
  } catch (e) {
    loadError = loadError || e;
    parentPort.postMessage({ type: 'error', id: msg.id, error: String(e) });
  }
});
