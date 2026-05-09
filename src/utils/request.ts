// src/utils/request.ts
import axios from 'axios'
import { ElMessage } from 'element-plus'

// CloudMind 后端 API 前缀：
// - 本地开发：/api，经 Vite proxy 转发到 http://localhost:8081
// - 服务器部署：/cloudmind-api/api，经 Nginx 转发到 http://127.0.0.1:8081/api
export const CLOUDMIND_API_BASE = (import.meta.env.VITE_CLOUDMIND_API_BASE || '/api').replace(/\/$/, '')

export const buildCloudMindApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${CLOUDMIND_API_BASE}${normalizedPath}`
}

// 定义后端统一的响应结构
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  timestamp?: number
}

// 定义分页通用返回结构
export interface PageData<T> {
  records: T[]
  total: number
  pageNo: number
  pageSize: number
}

// 普通 CRUD 请求，短超时（10秒）
const service = axios.create({
  baseURL: CLOUDMIND_API_BASE,
  timeout: 10000
})

// AI/RAG 专用请求，长超时（2分钟）
const aiService = axios.create({
  baseURL: CLOUDMIND_API_BASE,
  timeout: 120000
})

export const getLablinkToken = () => {
  return sessionStorage.getItem('lablink_token') || localStorage.getItem('token') || ''
}

const attachLablinkToken = (config: any) => {
  const token = getLablinkToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

const handleResponseData = (responseData: any) => {
  if (responseData && typeof responseData === 'object' && 'code' in responseData) {
    const res = responseData as ApiResponse
    if (res.code === 0 || res.code === 200) {
      return res.data
    }
    ElMessage.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message || 'Error'))
  }

  return responseData
}

const handleResponseError = (error: any) => {
  ElMessage.error(error?.message || '网络错误')
  return Promise.reject(error)
}

service.interceptors.request.use(attachLablinkToken)
aiService.interceptors.request.use(attachLablinkToken)

service.interceptors.response.use(
  (response) => handleResponseData(response.data),
  handleResponseError
)

aiService.interceptors.response.use(
  (response) => handleResponseData(response.data),
  handleResponseError
)

export { aiService }
export default service
