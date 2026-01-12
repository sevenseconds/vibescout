export interface VectorResult {
  collection: string;
  projectname: string;
  name: string;
  type: string;
  category: 'code' | 'documentation';
  filepath: string;
  startline: number;
  endline: number;
  comments: string;
  content: string;
  summary?: string;
  rerankScore?: number;
  vector?: number[];
}

export interface VectorDBProvider {
  name: string;
  insert(data: VectorResult[]): Promise<void>;
  search(embedding: number[], options: { collection?: string; projectName?: string; fileTypes?: string[]; categories?: string[]; limit?: number }): Promise<VectorResult[]>;
  hybridSearch(queryText: string, embedding: number[], options: { collection?: string; projectName?: string; fileTypes?: string[]; categories?: string[]; limit?: number }): Promise<VectorResult[]>;
  deleteByFile(filePath: string): Promise<void>;
  deleteByProject(projectName: string): Promise<void>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

export interface DBConfig {
  type: 'local' | 'cloudflare';
  accountId?: string;
  apiToken?: string;
  indexName?: string;
}
