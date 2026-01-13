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
  score?: number; // Base similarity score from vector search (0-1, higher is better)
  rerankScore?: number; // Reranked score after applying reranker model
  vector?: number[];

  // Git metadata fields (snake_case to match LanceDB column naming convention)
  last_commit_author?: string;
  last_commit_email?: string;
  last_commit_date?: string;
  last_commit_hash?: string;
  last_commit_message?: string;
  commit_count_6m?: number;
  churn_level?: 'low' | 'medium' | 'high';

  // File hash for change detection (snake_case to match LanceDB convention)
  file_hash?: string;
  last_mtime?: number;
  last_size?: number;

  // Token count for preview metadata (snake_case to match LanceDB convention)
  token_count?: number;
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
