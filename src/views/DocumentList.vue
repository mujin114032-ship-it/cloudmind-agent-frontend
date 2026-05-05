<!-- src/views/DocumentList.vue -->
<template>
  <div class="document-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <el-button @click="$router.push('/knowledge')">返回知识库列表</el-button>
          <span>文档管理与检索</span>
        </div>
      </template>

      <!-- 顶部操作区 -->
      <div class="header-action" style="margin-bottom: 20px; display: flex; justify-content: space-between;">
        <div>
          <el-input
            v-model="queryParams.keyword"
            placeholder="搜索文件名..."
            style="width: 260px;"
            clearable
            @keydown.enter="handleSearch"
            @clear="handleSearch"
            @input="handleKeywordInput"
          />
          <el-button type="primary" @click="handleSearch" style="margin-left: 10px; margin-right: 10px;">搜索</el-button>
          
          <el-upload
            action="#"
            :http-request="customUpload"
            :before-upload="beforeUpload"
            :show-file-list="false"
            accept=".pdf,.docx,.txt,.md,.html"
            style="display: inline-block;"
          >
            <el-button type="success" :loading="uploadLoading">上传真实文档</el-button>
          </el-upload>
        </div>

        <!-- 检索测试唤起按钮 -->
        <el-button type="warning" plain @click="retrievalDrawerVisible = true">
          🔍 向量检索测试
        </el-button>
      </div>

      <!-- 文档列表表格 -->
      <el-table :data="tableData" v-loading="loading" border style="width: 100%;">
        <el-table-column prop="fileName" label="文件名" min-width="200" show-overflow-tooltip />
        <el-table-column prop="fileType" label="类型" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.fileType.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="100" align="center">
          <template #default="{ row }">
            {{ formatFileSize(row.fileSize) }}
          </template>
        </el-table-column>
        <el-table-column label="解析状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getParseStatusType(row.parseStatus)" size="small">
              {{ getParseStatusText(row.parseStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="入库状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getIngestStatusType(row.ingestStatus)" size="small">
              {{ getIngestStatusText(row.ingestStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="chunkCount" label="分块数" width="80" align="center" />
        <el-table-column prop="createTime" label="添加时间" width="180" align="center" />
        <el-table-column label="操作" width="300" align="center" fixed="right">
          <template #default="{ row }">
            <!-- 1. 解析按钮 -->
            <el-button 
              v-if="row.parseStatus === 0 || row.parseStatus === 3" 
              link 
              type="warning" 
              :loading="parseLoadingMap[row.documentId]"
              @click="handleParse(row)"
            >
              解析
            </el-button>
            
            <!-- 2. 查看分块按钮 -->
            <el-button 
              v-if="row.chunkCount > 0" 
              link 
              type="primary" 
              @click="openChunksDrawer(row.documentId)"
            >
              查看分块
            </el-button>

            <!-- 3. 异步入库核心区 -->
            <template v-if="row.parseStatus === 2 && row.chunkCount > 0">
              
              <!-- 如果当前有正在轮询的活跃任务，显示进度条 -->
              <div v-if="activeTasks[row.documentId]" class="task-progress-box">
                <el-progress 
                  :percentage="activeTasks[row.documentId].progress || 0" 
                  :status="activeTasks[row.documentId].status === 3 ? 'exception' : (activeTasks[row.documentId].status === 2 ? 'success' : '')"
                  :stroke-width="8"
                />
                <div class="task-stage-text">
                  {{ getTaskStageText(activeTasks[row.documentId].stage) }} 
                  ({{ activeTasks[row.documentId].processedChunks }}/{{ activeTasks[row.documentId].totalChunks }})
                </div>
              </div>

              <!-- 否则显示操作按钮 -->
              <template v-else>
                <el-button 
                  v-if="row.ingestStatus === 0" 
                  link 
                  type="success" 
                  @click="handleAsyncIngest(row)"
                >
                  异步入库
                </el-button>
                <el-button 
                  v-else-if="row.ingestStatus === 1" 
                  link 
                  type="info" 
                  disabled
                >
                  等待队列中...
                </el-button>
                <el-button 
                  v-else-if="row.ingestStatus === 2" 
                  link 
                  type="info" 
                  disabled
                >
                  已入库
                </el-button>
                <el-button 
                  v-else-if="row.ingestStatus === 3" 
                  link 
                  type="danger" 
                  @click="handleAsyncIngest(row)"
                >
                  重新入库
                </el-button>
              </template>
            </template>

            <!-- 4. 移除按钮 -->
            <el-popconfirm title="确定要移除此文档吗？" @confirm="handleDelete(row.documentId)">
              <template #reference>
                <el-button link type="danger" :disabled="activeTasks[row.documentId]">移除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="queryParams.pageNo"
        v-model:page-size="queryParams.pageSize"
        :total="total"
        layout="total, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end;"
        @current-change="fetchData"
      />
    </el-card>

    <!-- 文档分块展示抽屉 -->
    <el-drawer v-model="drawerVisible" title="文档分块列表" size="700px">
      <div v-loading="chunksLoading">
        <el-table :data="chunksData" border style="width: 100%; margin-bottom: 20px;">
          <el-table-column prop="chunkIndex" label="序号" width="60" align="center" />
          <el-table-column prop="chunkText" label="分块内容" show-overflow-tooltip />
          <el-table-column prop="charCount" label="字符数" width="80" align="center" />
        </el-table>
        <el-pagination
          v-model:current-page="chunkQueryParams.pageNo"
          v-model:page-size="chunkQueryParams.pageSize"
          :total="chunkTotal"
          layout="total, prev, pager, next"
          style="justify-content: flex-end;"
          @current-change="fetchChunksData"
        />
      </div>
    </el-drawer>

    <!-- 知识库检索测试抽屉 -->
    <el-drawer v-model="retrievalDrawerVisible" title="Milvus 向量检索测试" size="600px">
      <div class="retrieval-container">
        <el-form :model="retrievalForm" label-width="100px" label-position="left">
          <el-form-item label="检索问题">
            <el-input 
              v-model="retrievalForm.query" 
              type="textarea" 
              :rows="3" 
              placeholder="请输入想要检索的问题..." 
              @keydown.enter.prevent="handleRetrievalTest"
            />
          </el-form-item>
          <el-form-item label="召回数量 (TopK)">
            <el-slider v-model="retrievalForm.topK" :min="1" :max="20" show-input />
          </el-form-item>
          <el-form-item label="最低相似度">
            <el-slider v-model="retrievalForm.scoreThreshold" :min="0" :max="1" :step="0.01" show-input />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="retrievalLoading" @click="handleRetrievalTest" style="width: 100%;">
              开始检索
            </el-button>
          </el-form-item>
        </el-form>

        <el-divider />

        <div class="retrieval-results" v-loading="retrievalLoading">
          <div v-if="retrievalResultData">
            <div style="margin-bottom: 15px; color: #606266; font-size: 14px; background: #f4f4f5; padding: 10px; border-radius: 6px;">
              检索耗时: <strong style="color: #67C23A;">{{ retrievalResultData.costMs }} ms</strong><br/>
              Milvus 直接命中: <strong style="color: #1a73e8;">{{ retrievalResultData.hitCount || retrievalResultData.resultCount }}</strong> 块<br/>
              最终装载上下文: <strong>{{ retrievalResultData.contextCount || retrievalResultData.resultCount }}</strong> 块
            </div>
            
            <div v-if="retrievalResultData.results.length === 0">
              <el-empty description="未检索到相关片段，可尝试降低最低相似度或换一个问题" />
            </div>
            
            <el-card 
              v-for="(item, index) in retrievalResultData.results" 
              :key="item.chunkId" 
              shadow="hover" 
              :class="['retrieval-test-card', { 'is-context': item.hit === false }]"
              style="margin-bottom: 15px;"
            >
              <template #header>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: bold; font-size: 14px;">
                    #{{ index + 1 }} {{ item.fileName }} (分块 {{ item.chunkIndex }})
                  </span>
                  <el-tag v-if="item.hit !== false" size="small" :type="item.score > 0.6 ? 'success' : 'warning'" effect="dark">
                    🎯 命中 Score: {{ item.score?.toFixed(4) || '0.0000' }}
                  </el-tag>
                  <el-tag v-else size="small" type="info" effect="plain">
                    🔗 扩展 (距离 {{ (item.distance ?? 0) > 0 ? '+' : '' }}{{ item.distance ?? 0 }})
                  </el-tag>
                </div>
              </template>
              <div style="font-size: 14px; line-height: 1.6; color: #303133; white-space: pre-wrap;">
                {{ item.textPreview }}
              </div>
            </el-card>
          </div>
          <el-empty v-else description="输入问题，测试底层向量召回效果" />
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { UploadRawFile } from 'element-plus'
import {
  getKnowledgeDocumentList,
  uploadDocumentToKnowledgeBase,
  parseDocument,
  listDocumentChunks,
  deleteKnowledgeDocument,
  submitIngestTask,
  getIngestTask,
  getLatestIngestTask
} from '@/api/document'
import type { KnowledgeDocumentVO, KnowledgeDocumentQueryRequest, DocumentChunkVO, DocumentIngestTaskVO } from '@/api/document'

import { retrievalTest } from '@/api/knowledge'
import type { RetrievalTestRequest, RetrievalTestVO } from '@/api/knowledge'

const route = useRoute()
const knowledgeBaseId = route.params.knowledgeBaseId as string

const loading = ref(false)
const tableData = ref<KnowledgeDocumentVO[]>([])
const total = ref(0)
const queryParams = reactive<KnowledgeDocumentQueryRequest>({
  pageNo: 1,
  pageSize: 10,
  keyword: ''
})

const uploadLoading = ref(false)
const parseLoadingMap = ref<Record<string, boolean>>({})

// --- 异步入库核心状态 ---
const activeTasks = ref<Record<string, DocumentIngestTaskVO>>({})
const pollingTimers: Record<string, number> = {}

// --- 分块详情抽屉状态 ---
const drawerVisible = ref(false)
const chunksLoading = ref(false)
const chunksData = ref<DocumentChunkVO[]>([])
const chunkTotal = ref(0)
const currentDocId = ref('')
const chunkQueryParams = reactive({ pageNo: 1, pageSize: 20 })

// --- 检索测试抽屉状态 ---
const retrievalDrawerVisible = ref(false)
const retrievalLoading = ref(false)
const retrievalForm = reactive<RetrievalTestRequest>({ query: '', topK: 5, scoreThreshold: 0.3 })
const retrievalResultData = ref<RetrievalTestVO | null>(null)

// --- 核心方法 ---
const fetchData = async () => {
  try {
    loading.value = true
    const res = await getKnowledgeDocumentList(knowledgeBaseId, queryParams)
    tableData.value = res.records
    total.value = res.total

    // 页面刷新时，自动检测是否有处于“入库中” (ingestStatus === 1) 的文档，恢复轮询
    res.records.forEach(async (row) => {
      if (row.ingestStatus === 1 && !pollingTimers[row.documentId]) {
        try {
          const task = await getLatestIngestTask(row.documentId)
          if (task && (task.status === 0 || task.status === 1)) {
            activeTasks.value[row.documentId] = task
            startPolling(row.documentId, task.taskId)
          }
        } catch (e) {
          // 忽略
        }
      }
    })

  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  queryParams.pageNo = 1
  fetchData()
}

const handleKeywordInput = (value: string) => {
  if (!value) handleSearch()
}

// 上传前置校验
const beforeUpload = (file: UploadRawFile) => {
  const MAX_FILE_SIZE = 100 * 1024 * 1024
  if (file.size > MAX_FILE_SIZE) {
    ElMessage.error(`上传文件大小不能超过 100MB，当前为 ${formatFileSize(file.size)}`)
    return false
  }
  const allowedTypes = ['pdf', 'docx', 'txt', 'md', 'html']
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !allowedTypes.includes(ext)) {
    ElMessage.error('格式错误：仅支持 pdf、docx、txt、md、html 文件')
    return false
  }
  return true
}

// 真实文件上传方法
const customUpload = async (options: any) => {
  const file = options.file as File
  try {
    uploadLoading.value = true
    await uploadDocumentToKnowledgeBase(knowledgeBaseId, file)
    ElMessage.success('文档上传成功')
    fetchData()
  } catch (error) {
    // 错误在 request.ts 已拦截提示
  } finally {
    uploadLoading.value = false
  }
}

// 解析文档方法
const handleParse = async (row: KnowledgeDocumentVO) => {
  try {
    parseLoadingMap.value[row.documentId] = true
    await parseDocument(row.documentId)
    ElMessage.success('解析指令执行成功')
    fetchData()
  } finally {
    parseLoadingMap.value[row.documentId] = false
  }
}

// 删除文档方法
const handleDelete = async (id: string) => {
  await deleteKnowledgeDocument(id)
  ElMessage.success('移除成功')
  if (tableData.value.length === 1 && queryParams.pageNo && queryParams.pageNo > 1) {
    queryParams.pageNo--
  }
  fetchData()
}

// 查看分块列表方法
const openChunksDrawer = (documentId: string) => {
  currentDocId.value = documentId
  chunkQueryParams.pageNo = 1
  drawerVisible.value = true
  fetchChunksData()
}

const fetchChunksData = async () => {
  try {
    chunksLoading.value = true
    const res = await listDocumentChunks(currentDocId.value, chunkQueryParams)
    chunksData.value = res.records
    chunkTotal.value = res.total
  } finally {
    chunksLoading.value = false
  }
}

// Milvus 检索测试方法
const handleRetrievalTest = async () => {
  if (!retrievalForm.query.trim()) {
    ElMessage.warning('请输入检索问题')
    return
  }
  try {
    retrievalLoading.value = true
    const res = await retrievalTest(knowledgeBaseId, retrievalForm)
    retrievalResultData.value = res
  } catch (error) {
    // 拦截器处理
  } finally {
    retrievalLoading.value = false
  }
}

// 提交异步入库任务
const handleAsyncIngest = async (row: KnowledgeDocumentVO) => {
  try {
    const task = await submitIngestTask(row.documentId)
    activeTasks.value[row.documentId] = task
    row.ingestStatus = 1 
    startPolling(row.documentId, task.taskId)
  } catch (error) {
    // 拦截器处理
  }
}

// 轮询控制器
const startPolling = (documentId: string, taskId: string) => {
  if (pollingTimers[documentId]) return 

  pollingTimers[documentId] = window.setInterval(async () => {
    try {
      const task = await getIngestTask(taskId)
      activeTasks.value[documentId] = task

      if (task.status === 2 || task.status === 3) {
        window.clearInterval(pollingTimers[documentId])
        delete pollingTimers[documentId]
        
        if (task.status === 2) {
          ElMessage.success('向量入库完成')
        } else {
          ElMessage.error(`入库异常: ${task.errorMessage || '未知错误'}`)
        }

        setTimeout(() => {
          delete activeTasks.value[documentId]
          fetchData()
        }, 2000)
      }
    } catch (error) {
      console.error('任务轮询异常', error)
    }
  }, 1500)
}

onUnmounted(() => {
  Object.values(pollingTimers).forEach(timer => window.clearInterval(timer))
})

// --- 工具函数 ---
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getParseStatusText = (status: number) => {
  const map: Record<number, string> = { 0: '未解析', 1: '解析中', 2: '解析成功', 3: '解析失败' }
  return map[status] || '未知'
}
const getParseStatusType = (status: number) => {
  const map: Record<number, string> = { 0: 'info', 1: 'warning', 2: 'success', 3: 'danger' }
  return map[status] || 'info'
}

const getIngestStatusText = (status: number) => {
  const map: Record<number, string> = { 0: '未入库', 1: '处理中', 2: '入库成功', 3: '入库失败' }
  return map[status] || '未知'
}
const getIngestStatusType = (status: number) => {
  const map: Record<number, string> = { 0: 'info', 1: 'warning', 2: 'success', 3: 'danger' }
  return map[status] || 'info'
}

const getTaskStageText = (stage: number) => {
  const map: Record<number, string> = { 
    0: '排队等待中', 
    1: '校验中', 
    2: '向量化计算中...', 
    3: '写入 Milvus 中...', 
    4: '更新状态', 
    5: '完成' 
  }
  return map[stage] || '处理中'
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.document-container {
  padding: 20px;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 20px;
  font-weight: bold;
}
.retrieval-container {
  padding: 10px;
}

/* 异步任务进度条容器样式 */
.task-progress-box {
  width: 140px;
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
}

.task-stage-text {
  font-size: 11px;
  color: #606266;
  white-space: nowrap;
}

.retrieval-test-card.is-context {
  border: 1px dashed #c0c4cc;
  background-color: #fafafa;
}
.retrieval-test-card.is-context :deep(.el-card__header) {
  background-color: #f4f4f5;
  border-bottom: 1px dashed #ebeef5;
}
</style>