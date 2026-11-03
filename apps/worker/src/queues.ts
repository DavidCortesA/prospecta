import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";

// BullMQ exige maxRetriesPerRequest = null en conexiones de workers.
export const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

export const COLLECT_QUEUE = "collect";

export type CollectJob = { sourceId: string };

export const collectQueue = new Queue<CollectJob>(COLLECT_QUEUE, { connection });
