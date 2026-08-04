import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../../config/index.js';

export const qdrant = new QdrantClient({
  url: `http://${config.qdrant.host}:${config.qdrant.port}`,
  apiKey: config.secrets.qdrantApiKey,
  checkCompatibility: false,
});

export async function checkQdrant(): Promise<boolean> {
  try {
    await qdrant.getCollections();
    return true;
  } catch {
    return false;
  }
}
