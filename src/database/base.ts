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

  // Git metadata fields
  lastCommitAuthor?: string;
  lastCommitEmail?: string;
  lastCommitDate?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  commitCount6m?: number;
  churnLevel?: 'low' | 'medium' | 'high';
}

export interface SearchOptions {
  collection?: string;
  projectName?: string;
  fileTypes?: string[];
  categories?: string[];
  limit?: number;

  // Git filters
  authors?: string[];
  dateFrom?: string;
  dateTo?: string;
  churnLevels?: ('low' | 'medium' | 'high')[];
}

export interface VectorDBProvider {
  name: string;
  insert(data: VectorResult[]): Promise<void>;
  search(embedding: number[], options: SearchOptions): Promise<VectorResult[]>;
  hybridSearch(queryText: string, embedding: number[], options: SearchOptions): Promise<VectorResult[]>;
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
