export type DigestStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Topic {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface TopicDigest {
  id: string;
  topicId: string;
  status: DigestStatus;
  content: string | null;
  watermarkDateKey: string | null;
  createdAt: string;
  updatedAt: string | null;
}
