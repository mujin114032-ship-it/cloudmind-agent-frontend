// src/api/document.ts
import request from '@/utils/request'
import type { PageData } from '@/utils/request'

export interface KnowledgeDocumentVO {
  documentId: string
  knowledgeBaseId: string
  fileId: string
  fileName: string
  fileType: string
  fileSize: number
  parserType: string
  parseStatus: number
  ingestStatus: number
  chunkCount: number
  embeddingModel: string
  embeddingDim: number
  errorMessage?: string | null
  createTime: string
  updateTime: string
}

// 上传文档的响应类型
export interface UploadKnowledgeDocumentResponse extends KnowledgeDocumentVO {
  storageType: string
  storagePath: string
  contentType?: string
}

// 文档分块的类型
export interface DocumentChunkVO {
  chunkId: string
  documentId: string
  chunkIndex: number
  chunkText: string
  chunkHash: string
  tokenCount: number
  charCount: number
  embeddingModel: string
  embeddingDim: number
  enabled: number
}

// 向量化测试的响应类型
export interface EmbeddingTestVO {
  documentId: string
  chunkCount: number
  vectorCount: number
  modelName: string
  embeddingDim: number
  costMs: number
  success: boolean
}

export interface KnowledgeDocumentQueryRequest {
  pageNo?: number
  pageSize?: number
  keyword?: string
}

// 1. 获取文档列表
export function getKnowledgeDocumentList(knowledgeBaseId: string, params: KnowledgeDocumentQueryRequest) {
  return request.get<any, PageData<KnowledgeDocumentVO>>(`/api/knowledge-bases/${knowledgeBaseId}/documents`, { params })
}

// 2. 删除文档
export function deleteKnowledgeDocument(documentId: string) {
  return request.delete<any, null>(`/api/knowledge-documents/${documentId}`)
}

// 3. 上传真实文档
export function uploadDocumentToKnowledgeBase(knowledgeBaseId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<any, UploadKnowledgeDocumentResponse>(
    `/api/knowledge-bases/${knowledgeBaseId}/documents/upload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
}

// 4. 解析文档并生成分块
export function parseDocument(documentId: string) {
  return request.post<any, null>(`/api/knowledge-documents/${documentId}/parse`)
}

// 5. 查询文档分块列表
export function listDocumentChunks(documentId: string, params?: { pageNo?: number; pageSize?: number }) {
  return request.get<any, PageData<DocumentChunkVO>>(`/api/knowledge-documents/${documentId}/chunks`, { params })
}

// 6. 测试文档向量化
export function embedTest(documentId: string) {
  return request.post<any, EmbeddingTestVO>(`/api/knowledge-documents/${documentId}/embed-test`)
}

export interface DocumentIngestVO {
  documentId: string
  chunkCount: number
  vectorCount: number
  modelName: string
  embeddingDim: number
  costMs: number
  ingestStatus: number
  success: boolean
}

// 7. 文档向量入库
export function ingestDocument(documentId: string) {
  return request.post<any, DocumentIngestVO>(`/api/knowledge-documents/${documentId}/ingest`)
}

export interface DocumentIngestTaskVO {
  taskId: string
  documentId: string
  knowledgeBaseId: string
  status: number
  stage: number
  progress: number
  totalChunks: number
  processedChunks: number
  modelName?: string
  embeddingDim?: number
  errorMessage?: string | null
  startTime?: string | null
  finishTime?: string | null
  createTime: string
}

// 1. 提交异步入库任务
export function submitIngestTask(documentId: string) {
  return request.post<any, DocumentIngestTaskVO>(`/api/knowledge-documents/${documentId}/ingest-async`)
}

// 2. 查询单次任务详情 (用于轮询)
export function getIngestTask(taskId: string) {
  return request.get<any, DocumentIngestTaskVO>(`/api/ingest-tasks/${taskId}`)
}

// 3. 查询文档最新的入库任务 (用于页面刷新后恢复轮询状态)
export function getLatestIngestTask(documentId: string) {
  return request.get<any, DocumentIngestTaskVO>(`/api/knowledge-documents/${documentId}/ingest-task`)
}