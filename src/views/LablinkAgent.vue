<template>
  <div class="lablink-agent-page">
    <div v-if="loading" class="center-card">
      <el-card class="status-card" shadow="never">
        <div class="status-icon">🤖</div>
        <h2>正在连接 LabLink 私有 Agent...</h2>
        <p>正在读取登录态并初始化你的私有知识库。</p>
        <el-progress :percentage="70" :indeterminate="true" />
      </el-card>
    </div>

    <div v-else-if="errorMessage" class="center-card">
      <el-card class="status-card" shadow="never">
        <div class="status-icon error">!</div>
        <h2>无法进入私有 Agent</h2>
        <p>{{ errorMessage }}</p>
        <div class="card-actions">
          <el-button type="primary" @click="goLablink">返回 LabLink</el-button>
          <el-button @click="bootstrap">重试</el-button>
        </div>
      </el-card>
    </div>

    <div v-else-if="bootstrapData && !bootstrapData.hasLlmKey" class="center-card">
      <el-card class="init-card" shadow="never">
        <div class="init-header">
          <div class="status-icon">🔑</div>
          <div>
            <h2>初始化私有 Agent</h2>
            <p>首次使用需要配置你的阿里百炼 API Key。Key 只会提交给 CloudMind 后端加密保存，不会写入浏览器本地存储。</p>
          </div>
        </div>

        <el-form label-position="top" class="key-form" @submit.prevent>
          <el-form-item label="API Key">
            <el-input
              v-model="apiKey"
              type="password"
              show-password
              clearable
              placeholder="sk-xxxxxxxxxxxxxxxx"
              @keyup.enter="saveKey"
            />
          </el-form-item>
          <el-form-item label="模型">
            <el-select v-model="modelName" style="width: 100%">
              <el-option label="qwen-plus" value="qwen-plus" />
            </el-select>
          </el-form-item>
          <el-button type="primary" size="large" :loading="saving" @click="saveKey" style="width: 100%">
            保存并进入 Agent
          </el-button>
        </el-form>

        <el-divider />
        <div class="guide">
          <h3>如何获取阿里百炼 API Key</h3>
          <ol>
            <li>打开阿里云百炼控制台。</li>
            <li>进入 API Key 管理页面。</li>
            <li>创建新的 API Key。</li>
            <li>创建后立即复制完整 Key。</li>
            <li>回到本页面粘贴并保存。</li>
          </ol>
        </div>
      </el-card>
    </div>

    <Chat v-else lablink-mode :bootstrap-data="bootstrapData" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import Chat from '@/views/Chat.vue'
import {
  getLablinkAgentBootstrap,
  saveLablinkAgentLlmKey
} from '@/api/lablinkAgent'
import type { LablinkAgentBootstrapData } from '@/api/lablinkAgent'

const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const bootstrapData = ref<LablinkAgentBootstrapData | null>(null)
const apiKey = ref('')
const modelName = ref('qwen-plus')

const persistTokenFromUrl = () => {
  const token = new URLSearchParams(window.location.search).get('token')
  if (token) {
    sessionStorage.setItem('lablink_token', token)
    router.replace('/lablink-agent')
  }
}

const goLablink = () => {
  window.location.href = 'http://localhost:5173/'
}

const bootstrap = async () => {
  const token = sessionStorage.getItem('lablink_token')
  if (!token) {
    loading.value = false
    errorMessage.value = '未获取到 LabLink 登录 token，请先从 LabLink 前端点击 Agent 悬浮按钮进入。'
    return
  }

  try {
    loading.value = true
    errorMessage.value = ''
    bootstrapData.value = await getLablinkAgentBootstrap()

    if (bootstrapData.value?.modelName) {
      modelName.value = bootstrapData.value.modelName
    }
  } catch (error: any) {
    errorMessage.value = error?.message || '初始化失败，请确认 CloudMind 后端 8081 已启动。'
  } finally {
    loading.value = false
  }
}

const saveKey = async () => {
  const key = apiKey.value.trim()
  if (!key.startsWith('sk-')) {
    ElMessage.warning('请输入 sk- 开头的阿里百炼 API Key')
    return
  }

  try {
    saving.value = true
    const data = await saveLablinkAgentLlmKey({ apiKey: key, modelName: modelName.value })
    apiKey.value = ''
    bootstrapData.value = data
    ElMessage.success('配置成功，已进入私有 Agent')

    if (!data?.hasLlmKey) {
      await bootstrap()
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  persistTokenFromUrl()
  bootstrap()
})
</script>

<style scoped>
.lablink-agent-page {
  min-height: 100vh;
  background: #f7f8fa;
}
.center-card {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}
.status-card,
.init-card {
  width: min(560px, 100%);
  border-radius: 18px;
  border: 1px solid #e5e7eb;
}
.status-card {
  text-align: center;
  padding: 20px;
}
.status-card h2,
.init-card h2 {
  margin: 10px 0 8px;
  color: #1f2937;
}
.status-card p,
.init-card p {
  color: #6b7280;
  line-height: 1.7;
}
.status-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: #e8f1ff;
  color: #2563eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
}
.status-icon.error {
  background: #fee2e2;
  color: #dc2626;
}
.card-actions {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  gap: 12px;
}
.init-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 24px;
}
.key-form {
  margin-top: 8px;
}
.guide h3 {
  margin: 0 0 10px;
  color: #374151;
}
.guide ol {
  margin: 0;
  padding-left: 20px;
  color: #6b7280;
  line-height: 1.9;
}
</style>
