<!-- src/views/KnowledgeList.vue -->
<template>
  <div class="knowledge-container">
    <el-card>
      <!-- 顶部搜索与操作区 -->
      <div class="header-action">
        <el-input
          v-model="queryParams.keyword"
          placeholder="搜索知识库名称..."
          style="width: 260px;"
          clearable
          @keyup.enter="handleSearch"
        />
        <el-button type="primary" @click="handleSearch" style="margin-left: 10px;">搜索</el-button>
        <el-button type="success" @click="openDialog()">创建知识库</el-button>
      </div>

      <!-- 数据表格 -->
      <el-table :data="tableData" v-loading="loading" border style="width: 100%; margin-top: 20px;">
        <el-table-column prop="name" label="知识库名称" min-width="150" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="documentCount" label="文档数" width="100" align="center" />
        <el-table-column prop="createTime" label="创建时间" width="180" align="center" />
        <el-table-column prop="updateTime" label="更新时间" width="180" align="center" />
        <el-table-column label="操作" width="200" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="primary" @click="$router.push(`/knowledge/${row.id}/documents`)">
              文档管理
            </el-button>
            <el-button link type="success" @click="$router.push(`/knowledge/${row.id}/chat`)">
              智能 Agent 问答
            </el-button>
            <el-popconfirm title="确定要删除这个知识库吗？" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button link type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="queryParams.pageNo"
        v-model:page-size="queryParams.pageSize"
        :total="total"
        layout="total, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end;"
        @current-change="fetchData"
      />
    </el-card>

    <!-- 创建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑知识库' : '创建知识库'"
      width="500px"
      @close="resetForm"
    >
      <el-form :model="formData" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="知识库名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入知识库名称，例如：遥感论文知识库" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="用于存放相关领域文档"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import {
  getKnowledgeBaseList,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase
} from '@/api/knowledge'
import type { KnowledgeBaseVO, KnowledgeBaseQueryRequest } from '@/api/knowledge'

// 列表状态
const loading = ref(false)
const tableData = ref<KnowledgeBaseVO[]>([])
const total = ref(0)
const queryParams = reactive<KnowledgeBaseQueryRequest>({
  pageNo: 1,
  pageSize: 10,
  keyword: ''
})

// 表单状态
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()
const currentId = ref('')
const formData = reactive({
  name: '',
  description: ''
})
const rules = {
  name: [{ required: true, message: '请输入知识库名称', trigger: 'blur' }]
}

// 获取列表数据
const fetchData = async () => {
  try {
    loading.value = true
    const res = await getKnowledgeBaseList(queryParams)
    tableData.value = res.records
    total.value = res.total
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  queryParams.pageNo = 1
  fetchData()
}

// 打开弹窗（区分新建和编辑）
const openDialog = (row?: KnowledgeBaseVO) => {
  isEdit.value = !!row
  if (row) {
    currentId.value = row.id
    formData.name = row.name
    formData.description = row.description || ''
  } else {
    currentId.value = ''
    formData.name = ''
    formData.description = ''
  }
  dialogVisible.value = true
}

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        submitLoading.value = true
        if (isEdit.value) {
          await updateKnowledgeBase(currentId.value, formData)
          ElMessage.success('更新成功')
        } else {
          await createKnowledgeBase(formData)
          ElMessage.success('创建成功')
        }
        dialogVisible.value = false
        fetchData() // 刷新列表
      } finally {
        submitLoading.value = false
      }
    }
  })
}

// 清除表单校验状态
const resetForm = () => {
  formRef.value?.resetFields()
}

// 删除知识库
const handleDelete = async (id: string) => {
  await deleteKnowledgeBase(id)
  ElMessage.success('删除成功')
  if (tableData.value.length === 1 && queryParams.pageNo && queryParams.pageNo > 1) {
    queryParams.pageNo-- // 如果当前页删空了，自动跳回上一页
  }
  fetchData()
}

// 页面挂载时初始化数据
onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.knowledge-container {
  padding: 20px;
}
.header-action {
  display: flex;
  align-items: center;
}
</style>