import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import HeatMap from 'react-calendar-heatmap'
import 'react-calendar-heatmap/dist/styles.css'

// ========== Supabase 客户端初始化 ==========
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('请在 EdgeOne Pages 中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ========== 工具函数：密码加密（PBKDF2） ==========
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  )
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return btoa(String.fromCharCode(...hashArray))
}

function generateSalt(): string {
  return crypto.randomBytes ? crypto.randomBytes(16).toString('base64') : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => String.fromCharCode(b)).join('')
}

// ========== 类型定义 ==========
interface Child {
  id: string
  name: string
  pet_type: string
  total_score: number
  pet_level: number
  created_at: string
}

interface Task {
  id: string
  name: string
  category: string
  points: number
  daily_limit: number
  is_active: boolean
}

interface CheckinResult {
  pointsEarned: number
  oldTotal: number
  newTotal: number
  oldLevel: number
  newLevel: number
  leveledUp: boolean
}

// ========== App 主组件 ==========
function App() {
  // ----- 状态 -----
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const [userId, setUserId] = useState<string | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [showChildForm, setShowChildForm] = useState(false)
  const [newChildName, setNewChildName] = useState('')
  const [newChildPet, setNewChildPet] = useState('cat')

  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null)

  const [showCheckins, setShowCheckins] = useState(false)
  const [checkins, setCheckins] = useState<any[]>([])

  const [showShop, setShowShop] = useState(false)
  const [rewards, setRewards] = useState<any[]>([])
  const [newRewardName, setNewRewardName] = useState('')
  const [newRewardCost, setNewRewardCost] = useState('')

  const [showRedemptions, setShowRedemptions] = useState(false)
  const [redemptions, setRedemptions] = useState<any[]>([])

  const [showStats, setShowStats] = useState(false)
  const [heatmapData, setHeatmapData] = useState<{ date: string; count: number }[]>([])

  // ========== 注册 ==========
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    if (!username || !password) {
      setMessage('❌ 用户名和密码不能为空')
      return
    }
    if (password.length < 6) {
      setMessage('❌ 密码至少6位')
      return
    }

    try {
      // 1. 检查用户名是否已存在
      const { data: existing, error: checkError } = await supabase
        .from('users')
        .select('username')
        .eq('username', username)
        .maybeSingle()

      if (checkError) {
        setMessage('❌ 查询用户失败: ' + checkError.message)
        return
      }
      if (existing) {
        setMessage('❌ 用户名已存在')
        return
      }

      // 2. 生成 salt 和密码哈希
      const salt = generateSalt()
      const passwordHash = await hashPassword(password, salt)

      // 3. 插入用户
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          username,
          password_hash: passwordHash,
          salt,
          iterations: 100000,
          role: 'parent'
        })
        .select('id, username, role')
        .single()

      if (insertError) {
        setMessage('❌ 注册失败: ' + insertError.message)
        return
      }

      setMessage('✅ 注册成功！请登录')
      setIsLogin(true)
    } catch (err: any) {
      setMessage('❌ 注册出错: ' + err.message)
    }
  }

  // ========== 登录 ==========
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    if (!username || !password) {
      setMessage('❌ 用户名和密码不能为空')
      return
    }

    try {
      // 1. 查询用户
      const { data: user, error: queryError } = await supabase
        .from('users')
        .select('id, username, password_hash, salt, iterations, role')
        .eq('username', username)
        .maybeSingle()

      if (queryError || !user) {
        setMessage('❌ 用户名或密码错误')
        return
      }

      // 2. 验证密码
      const hash = await hashPassword(password, user.salt)
      if (hash !== user.password_hash) {
        setMessage('❌ 用户名或密码错误')
        return
      }

      // 3. 登录成功
      setUserId(user.id)
      localStorage.setItem('userId', user.id)
      localStorage.setItem('username', user.username)
      setMessage('✅ 登录成功！')
    } catch (err: any) {
      setMessage('❌ 登录出错: ' + err.message)
    }
  }

  // ========== 加载孩子列表 ==========
  const loadChildren = async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('parent_id', userId)
        .order('created_at', { ascending: true })
      if (error) throw error
      setChildren(data || [])
      if (data && data.length > 0 && !selectedChild) {
        setSelectedChild(data[0])
      }
    } catch (err: any) {
      console.error('加载孩子失败:', err)
    }
  }

  // ========== 加载任务列表 ==========
  const loadTasks = async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('parent_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setTasks(data || [])
    } catch (err: any) {
      console.error('加载任务失败:', err)
    }
  }

  // ========== 创建孩子 ==========
  const handleCreateChild = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !newChildName.trim()) {
      setMessage('❌ 请输入孩子姓名')
      return
    }
    try {
      const { data, error } = await supabase
        .from('children')
        .insert({
          parent_id: userId,
          name: newChildName.trim(),
          pet_type: newChildPet,
          total_score: 0,
          pet_level: 0
        })
        .select('*')
        .single()
      if (error) throw error
      setMessage('✅ 孩子创建成功')
      setNewChildName('')
      setShowChildForm(false)
      await loadChildren()
    } catch (err: any) {
      setMessage('❌ 创建失败: ' + err.message)
    }
  }

  // ========== 打卡 ==========
  const handleCheckin = async (taskId: string) => {
    if (!selectedChild) {
      setMessage('❌ 请先选择孩子')
      return
    }

    try {
      // 1. 获取任务信息
      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single()
      if (taskErr || !task) {
        setMessage('❌ 任务不存在')
        return
      }
      if (!task.is_active) {
        setMessage('❌ 任务已停用')
        return
      }

      // 2. 检查今日打卡次数
      const today = new Date().toISOString().split('T')[0]
      const { data: todayCheckins, error: countErr } = await supabase
        .from('checkins')
        .select('id')
        .eq('child_id', selectedChild.id)
        .eq('task_id', taskId)
        .gte('created_at', `${today}T00:00:00Z`)
        .lt('created_at', `${today}T23:59:59Z`)

      if (countErr) throw countErr
      if (todayCheckins && todayCheckins.length >= task.daily_limit) {
        setMessage(`❌ 今日已打卡${todayCheckins.length}次，已达上限`)
        return
      }

      // 3. 计算新积分和等级
      const oldTotal = selectedChild.total_score
      const newTotal = oldTotal + task.points
      const thresholds = [0, 40, 100, 180, 280, 400, 540, 700]
      let newLevel = 0
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (newTotal >= thresholds[i]) {
          newLevel = i
          break
        }
      }

      // 4. 更新孩子积分
      const { error: updateErr } = await supabase
        .from('children')
        .update({ total_score: newTotal, pet_level: newLevel })
        .eq('id', selectedChild.id)
      if (updateErr) throw updateErr

      // 5. 记录打卡
      const { error: insertErr } = await supabase
        .from('checkins')
        .insert({
          child_id: selectedChild.id,
          task_id: taskId,
          checkin_date: today,
          points_earned: task.points,
          score_before: oldTotal,
          score_after: newTotal
        })
      if (insertErr) throw insertErr

      // 6. 更新本地状态
      const result: CheckinResult = {
        pointsEarned: task.points,
        oldTotal,
        newTotal,
        oldLevel: selectedChild.pet_level,
        newLevel,
        leveledUp: newLevel > selectedChild.pet_level
      }
      setCheckinResult(result)
      setMessage(`✅ 打卡成功！获得 ${task.points} 分`)
      setSelectedChild({ ...selectedChild, total_score: newTotal, pet_level: newLevel })
      await loadChildren()
      if (selectedChild) await loadCheckins(selectedChild.id)
    } catch (err: any) {
      setMessage('❌ 打卡失败: ' + err.message)
    }
  }

  // ========== 加载打卡记录 ==========
  const loadCheckins = async (childId: string) => {
    try {
      const { data, error } = await supabase
        .from('checkins')
        .select(`*, tasks ( name, category, points )`)
        .eq('child_id', childId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setCheckins(data || [])
    } catch (err: any) {
      console.error('加载打卡记录失败:', err)
    }
  }

  // ========== 撤回打卡 ==========
  const handleUndoCheckin = async (checkinId: string) => {
    if (!confirm('确定要撤回这条打卡记录吗？')) return

    try {
      // 1. 获取打卡记录
      const { data: checkin, error: qErr } = await supabase
        .from('checkins')
        .select('*')
        .eq('id', checkinId)
        .single()
      if (qErr || !checkin) {
        setMessage('❌ 打卡记录不存在')
        return
      }

      // 2. 获取孩子当前信息
      const { data: child, error: cErr } = await supabase
        .from('children')
        .select('*')
        .eq('id', checkin.child_id)
        .single()
      if (cErr || !child) {
        setMessage('❌ 孩子档案不存在')
        return
      }

      const newTotal = Math.max(0, child.total_score - checkin.points_earned)
      const thresholds = [0, 40, 100, 180, 280, 400, 540, 700]
      let newLevel = 0
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (newTotal >= thresholds[i]) {
          newLevel = i
          break
        }
      }

      // 3. 更新孩子积分
      const { error: updateErr } = await supabase
        .from('children')
        .update({ total_score: newTotal, pet_level: newLevel })
        .eq('id', child.id)
      if (updateErr) throw updateErr

      // 4. 删除打卡记录
      const { error: delErr } = await supabase
        .from('checkins')
        .delete()
        .eq('id', checkinId)
      if (delErr) throw delErr

      setMessage(`↩️ 撤回成功！扣回 ${checkin.points_earned} 分`)
      if (selectedChild) {
        setSelectedChild({ ...selectedChild, total_score: newTotal, pet_level: newLevel })
        await loadCheckins(selectedChild.id)
      }
      await loadChildren()
    } catch (err: any) {
      setMessage('❌ 撤回失败: ' + err.message)
    }
  }

  // ========== 加载热力图数据 ==========
  const loadStats = async (childId: string) => {
    try {
      const startDate = new Date()
      startDate.setFullYear(startDate.getFullYear() - 1)
      const start = startDate.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('checkins')
        .select('checkin_date')
        .eq('child_id', childId)
        .gte('checkin_date', start)
      if (error) throw error

      const dateMap: Record<string, number> = {}
      data.forEach((row: any) => {
        const date = row.checkin_date
        dateMap[date] = (dateMap[date] || 0) + 1
      })
      const statsData = Object.entries(dateMap).map(([date, count]) => ({ date, count }))
      setHeatmapData(statsData)
    } catch (err: any) {
      console.error('加载统计失败:', err)
    }
  }

  // ========== 商店相关 ==========
  const loadRewards = async (childId: string) => {
    if (!userId) return
    try {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .eq('parent_id', userId)
        .eq('is_available', true)
        .or(`child_id.eq.${childId},child_id.is.null`)
        .order('created_at', { ascending: false })
      if (error) throw error
      setRewards(data || [])
    } catch (err: any) {
      console.error('加载商店失败:', err)
    }
  }

  const handleRedeem = async (rewardId: string, cost: number) => {
    if (!selectedChild) return
    if (!confirm(`确定要花费 ${cost} 积分兑换此奖励吗？`)) return

    try {
      // 检查积分
      if (selectedChild.total_score < cost) {
        setMessage('❌ 积分不足')
        return
      }

      const scoreBefore = selectedChild.total_score
      const scoreAfter = scoreBefore - cost

      // 扣除积分
      const { error: updateErr } = await supabase
        .from('children')
        .update({ total_score: scoreAfter })
        .eq('id', selectedChild.id)
      if (updateErr) throw updateErr

      // 创建兑换记录
      const { error: insertErr } = await supabase
        .from('redemptions')
        .insert({
          child_id: selectedChild.id,
          reward_id: rewardId,
          cost: cost,
          status: 'pending',
          score_before: scoreBefore,
          score_after: scoreAfter
        })
      if (insertErr) {
        // 回滚积分
        await supabase
          .from('children')
          .update({ total_score: scoreBefore })
          .eq('id', selectedChild.id)
        throw insertErr
      }

      setMessage('✅ 兑换成功，等待审批')
      setSelectedChild({ ...selectedChild, total_score: scoreAfter })
      await loadChildren()
      await loadRewards(selectedChild.id)
    } catch (err: any) {
      setMessage('❌ 兑换失败: ' + err.message)
    }
  }

  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    if (!newRewardName.trim() || !newRewardCost) {
      setMessage('❌ 请填写奖励名称和积分')
      return
    }
    const cost = parseInt(newRewardCost)
    if (isNaN(cost) || cost <= 0) {
      setMessage('❌ 积分必须是正数')
      return
    }

    try {
      const { error } = await supabase
        .from('rewards')
        .insert({
          parent_id: userId,
          child_id: selectedChild?.id || null,
          name: newRewardName.trim(),
          cost: cost,
          is_available: true
        })
      if (error) throw error
      setMessage('✅ 奖励创建成功')
      setNewRewardName('')
      setNewRewardCost('')
      if (selectedChild) await loadRewards(selectedChild.id)
    } catch (err: any) {
      setMessage('❌ 创建失败: ' + err.message)
    }
  }

  // ========== 审批兑换 ==========
  const loadRedemptions = async () => {
    if (!userId) return
    try {
      const { data, error } = await supabase
        .from('redemptions')
        .select(`
          *,
          children!inner ( id, name, parent_id ),
          rewards ( id, name, cost )
        `)
        .eq('children.parent_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setRedemptions(data || [])
    } catch (err: any) {
      console.error('加载兑换记录失败:', err)
    }
  }

  const handleApproveRedemption = async (redemptionId: string) => {
    if (!confirm('确认批准此兑换？')) return
    try {
      const { error } = await supabase
        .from('redemptions')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', redemptionId)
      if (error) throw error
      setMessage('✅ 已批准')
      await loadRedemptions()
      await loadChildren()
    } catch (err: any) {
      setMessage('❌ 操作失败: ' + err.message)
    }
  }

  const handleRejectRedemption = async (redemptionId: string) => {
    if (!confirm('确认拒绝此兑换？积分将返还给孩子。')) return
    try {
      // 获取兑换记录
      const { data: redemption, error: fetchErr } = await supabase
        .from('redemptions')
        .select('*')
        .eq('id', redemptionId)
        .single()
      if (fetchErr || !redemption) throw new Error('记录不存在')

      // 返还积分
      const { data: child } = await supabase
        .from('children')
        .select('total_score')
        .eq('id', redemption.child_id)
        .single()
      if (child) {
        await supabase
          .from('children')
          .update({ total_score: child.total_score + redemption.cost })
          .eq('id', redemption.child_id)
      }

      // 更新状态
      const { error } = await supabase
        .from('redemptions')
        .update({ status: 'rejected' })
        .eq('id', redemptionId)
      if (error) throw error

      setMessage('✅ 已拒绝，积分已返还')
      await loadRedemptions()
      await loadChildren()
    } catch (err: any) {
      setMessage('❌ 操作失败: ' + err.message)
    }
  }

  // ========== 切换孩子 ==========
  const selectChild = async (child: Child) => {
    setSelectedChild(child)
    setCheckinResult(null)
    await loadCheckins(child.id)
    await loadRewards(child.id)
    await loadStats(child.id)
  }

  // ========== 登出 ==========
  const handleLogout = () => {
    setUserId(null)
    setSelectedChild(null)
    setChildren([])
    setTasks([])
    setCheckins([])
    setRedemptions([])
    setRewards([])
    setHeatmapData([])
    localStorage.removeItem('userId')
    localStorage.removeItem('username')
    setMessage('')
    setCheckinResult(null)
  }

  // ========== 自动登录 ==========
  useEffect(() => {
    const savedUserId = localStorage.getItem('userId')
    if (savedUserId) {
      setUserId(savedUserId)
    }
  }, [])

  useEffect(() => {
    if (userId) {
      loadChildren()
      loadTasks()
      loadRedemptions()
    }
  }, [userId])

  // ========== 宠物等级辅助 ==========
  const getLevelLabel = (level: number): string => {
    const labels = ['破壳', '好奇张望', '活泼成长', '自信挺立', '少年英姿', '优雅成熟', '威严高贵', '传奇加冕']
    return labels[level] || '未知'
  }

  const getPetEmoji = (type: string, level: number): string => {
    const pets: Record<string, string[]> = {
      cat: ['🐱', '🐈', '🐈', '🐈', '🐈‍⬛', '🐈‍⬛', '🐅', '🐯'],
      dog: ['🐶', '🐕', '🐕', '🐕‍🦺', '🐩', '🐕‍🦺', '🐕', '🐺'],
      rabbit: ['🐰', '🐇', '🐇', '🐇', '🐰', '🐇', '🐇', '🐇']
    }
    const list = pets[type] || pets.cat
    return list[level] || list[0]
  }

  const getProgress = (score: number): number => {
    const thresholds = [0, 40, 100, 180, 280, 400, 540, 700]
    let level = 0
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (score >= thresholds[i]) { level = i; break }
    }
    const current = thresholds[level]
    const next = thresholds[level + 1] || current + 200
    const progress = (score - current) / (next - current) * 100
    return Math.min(progress, 100)
  }

  // ========== 登录/注册界面 ==========
  if (!userId) {
    return (
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px',
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '24px', color: '#1a1a2e' }}>
          🐾 打卡宠物
        </h1>
        <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '18px', color: '#555' }}>
          {isLogin ? '登录' : '注册'}
        </h2>
        <form onSubmit={isLogin ? handleLogin : handleRegister}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
              }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? '请输入密码' : '至少6位'}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              background: '#4F46E5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {isLogin ? '登录' : '注册'}
          </button>
        </form>
        {message && (
          <p style={{
            marginTop: '16px',
            textAlign: 'center',
            color: message.includes('✅') ? '#22c55e' : '#ef4444',
            fontSize: '14px',
          }}>
            {message}
          </p>
        )}
        <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: '#888' }}>
          {isLogin ? '还没有账号？' : '已有账号？'}
          <button
            onClick={() => setIsLogin(!isLogin)}
            style={{
              background: 'none',
              border: 'none',
              color: '#4F46E5',
              fontWeight: '600',
              cursor: 'pointer',
              marginLeft: '4px',
            }}
          >
            {isLogin ? '去注册' : '去登录'}
          </button>
        </p>
      </div>
    )
  }

  // ========== 主界面 ==========
  return (
    <div style={{
      background: 'white',
      padding: '30px',
      borderRadius: '16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      width: '100%',
      maxWidth: '600px',
      maxHeight: '90vh',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#1a1a2e' }}>🐾 打卡宠物</h2>
        <div>
          <span style={{ marginRight: '12px', color: '#555' }}>{localStorage.getItem('username')}</span>
          <button
            onClick={handleLogout}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            登出
          </button>
        </div>
      </div>

      {/* 孩子选择 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontWeight: '600' }}>👶 选择孩子</span>
          <button
            onClick={() => setShowChildForm(!showChildForm)}
            style={{
              background: '#4F46E5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + 添加孩子
          </button>
        </div>
        {showChildForm && (
          <form onSubmit={handleCreateChild} style={{
            background: '#f8f9fa',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '12px',
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                placeholder="孩子姓名"
                style={{
                  flex: '1',
                  padding: '6px 10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  minWidth: '100px',
                }}
              />
              <select
                value={newChildPet}
                onChange={(e) => setNewChildPet(e.target.value)}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                }}
              >
                <option value="cat">🐱 猫</option>
                <option value="dog">🐶 狗</option>
                <option value="rabbit">🐰 兔</option>
              </select>
              <button
                type="submit"
                style={{
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 16px',
                  cursor: 'pointer',
                }}
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => setShowChildForm(false)}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          </form>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => selectChild(child)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: selectedChild?.id === child.id ? '2px solid #4F46E5' : '1px solid #ddd',
                background: selectedChild?.id === child.id ? '#eef2ff' : 'white',
                cursor: 'pointer',
              }}
            >
              {getPetEmoji(child.pet_type, child.pet_level)} {child.name}
              <span style={{ fontSize: '12px', color: '#888', marginLeft: '4px' }}>
                ({child.total_score}分)
              </span>
            </button>
          ))}
          {children.length === 0 && (
            <span style={{ color: '#888', fontSize: '14px' }}>还没有孩子，点击"添加孩子"创建</span>
          )}
        </div>
      </div>

      {/* 选中孩子详情 */}
      {selectedChild && (
        <div style={{
          background: '#f0f4ff',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '48px' }}>
              {getPetEmoji(selectedChild.pet_type, selectedChild.pet_level)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '600', fontSize: '18px' }}>{selectedChild.name}</span>
                <span style={{ color: '#4F46E5', fontWeight: '600' }}>
                  {getLevelLabel(selectedChild.pet_level)}
                </span>
              </div>
              <div style={{ fontSize: '14px', color: '#555' }}>
                积分: {selectedChild.total_score} 分
              </div>
              <div style={{
                width: '100%',
                background: '#ddd',
                borderRadius: '10px',
                height: '8px',
                marginTop: '4px',
              }}>
                <div style={{
                  width: `${getProgress(selectedChild.total_score)}%`,
                  background: '#4F46E5',
                  borderRadius: '10px',
                  height: '8px',
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>
          </div>
          {checkinResult && (
            <div style={{
              marginTop: '12px',
              padding: '10px',
              borderRadius: '8px',
              background: checkinResult.leveledUp ? '#fef3c7' : '#d1fae5',
              border: checkinResult.leveledUp ? '1px solid #f59e0b' : '1px solid #34d399',
            }}>
              {checkinResult.leveledUp ? (
                <span style={{ fontWeight: '600', color: '#d97706' }}>
                  🎉 升级啦！{getLevelLabel(checkinResult.newLevel)}
                </span>
              ) : (
                <span style={{ color: '#065f46' }}>
                  +{checkinResult.pointsEarned} 分 ({checkinResult.oldTotal} → {checkinResult.newTotal})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 任务列表 */}
      {selectedChild && tasks.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>📋 今日任务</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tasks.filter(t => t.is_active).map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #eee',
                }}
              >
                <div>
                  <span style={{ fontWeight: '500' }}>{task.name}</span>
                  <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                    {task.category} · {task.points}分
                  </span>
                  <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '8px' }}>
                    每日上限 {task.daily_limit}次
                  </span>
                </div>
                <button
                  onClick={() => handleCheckin(task.id)}
                  style={{
                    background: '#4F46E5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 14px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  ✅ 打卡
                </button>
              </div>
            ))}
            {tasks.filter(t => t.is_active).length === 0 && (
              <p style={{ color: '#888', fontSize: '14px' }}>暂无任务，请在 Supabase 中手动添加</p>
            )}
          </div>
        </div>
      )}

      {/* 打卡记录 */}
      {selectedChild && (
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => {
              const newState = !showCheckins
              setShowCheckins(newState)
              if (newState && selectedChild) loadCheckins(selectedChild.id)
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#4F46E5',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            📋 {showCheckins ? '收起打卡记录' : '查看打卡记录'}
          </button>
          {showCheckins && (
            <div style={{ marginTop: '8px' }}>
              {checkins.length === 0 ? (
                <p style={{ color: '#888', fontSize: '14px' }}>暂无打卡记录</p>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {checkins.slice(0, 20).map((record) => (
                    <div
                      key={record.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        borderBottom: '1px solid #f0f0f0',
                        fontSize: '14px',
                      }}
                    >
                      <span>
                        {record.tasks?.name || '未知任务'}
                        <span style={{ color: '#4F46E5', marginLeft: '8px' }}>
                          +{record.points_earned}分
                        </span>
                        <span style={{ color: '#aaa', marginLeft: '8px', fontSize: '12px' }}>
                          {new Date(record.created_at).toLocaleDateString()}
                        </span>
                      </span>
                      <button
                        onClick={() => handleUndoCheckin(record.id)}
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 10px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        撤回
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 商店 */}
      {selectedChild && (
        <div style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
          <button
            onClick={() => {
              const newState = !showShop
              setShowShop(newState)
              if (newState && selectedChild) loadRewards(selectedChild.id)
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#4F46E5',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            🎁 {showShop ? '收起商店' : '查看商店'}
          </button>
          {showShop && (
            <div>
              <form onSubmit={handleCreateReward} style={{
                background: '#f8f9fa',
                padding: '12px',
                borderRadius: '8px',
                marginTop: '8px',
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                <input
                  type="text"
                  value={newRewardName}
                  onChange={(e) => setNewRewardName(e.target.value)}
                  placeholder="奖励名称（如：看电视）"
                  style={{
                    flex: '1',
                    padding: '6px 10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    minWidth: '120px'
                  }}
                />
                <input
                  type="number"
                  value={newRewardCost}
                  onChange={(e) => setNewRewardCost(e.target.value)}
                  placeholder="积分"
                  style={{
                    width: '80px',
                    padding: '6px 10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    cursor: 'pointer'
                  }}
                >
                  + 添加奖励
                </button>
              </form>
              {rewards.length === 0 ? (
                <p style={{ color: '#888', fontSize: '14px', marginTop: '8px' }}>暂无商店奖励</p>
              ) : (
                <div style={{ marginTop: '8px' }}>
                  {rewards.map((reward) => (
                    <div
                      key={reward.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        borderBottom: '1px solid #f0f0f0'
                      }}
                    >
                      <span>
                        {reward.name}
                        <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                          🪙 {reward.cost}分
                        </span>
                      </span>
                      <button
                        onClick={() => handleRedeem(reward.id, reward.cost)}
                        disabled={selectedChild.total_score < reward.cost}
                        style={{
                          background: selectedChild.total_score >= reward.cost ? '#4F46E5' : '#ccc',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 14px',
                          cursor: selectedChild.total_score >= reward.cost ? 'pointer' : 'not-allowed',
                          fontSize: '13px'
                        }}
                      >
                        兑换
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* 审批区域 */}
              <div style={{ marginTop: '16px', borderTop: '1px solid #ddd', paddingTop: '12px' }}>
                <button
                  onClick={() => {
                    const newState = !showRedemptions
                    setShowRedemptions(newState)
                    if (newState) loadRedemptions()
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f59e0b',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  📋 {showRedemptions ? '收起待审批' : `待审批兑换 (${redemptions.filter(r => r.status === 'pending').length})`}
                </button>
                {showRedemptions && (
                  <div style={{ marginTop: '8px' }}>
                    {redemptions.filter(r => r.status === 'pending').length === 0 ? (
                      <p style={{ color: '#888', fontSize: '14px' }}>🎉 暂无待审批的兑换</p>
                    ) : (
                      redemptions.filter(r => r.status === 'pending').map((record) => (
                        <div
                          key={record.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            background: '#fffbeb',
                            borderRadius: '8px',
                            marginBottom: '6px',
                            border: '1px solid #fde68a'
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: '500' }}>
                              {record.children?.name || '未知孩子'}
                            </span>
                            <span style={{ marginLeft: '8px' }}>
                              🎁 {record.rewards?.name || '未知奖励'}
                            </span>
                            <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                              🪙 {record.cost}分
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleApproveRedemption(record.id)}
                              style={{
                                background: '#22c55e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 12px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              ✅ 批准
                            </button>
                            <button
                              onClick={() => handleRejectRedemption(record.id)}
                              style={{
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 12px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              ❌ 拒绝
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 热力图 */}
      {selectedChild && (
        <div style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
          <button
            onClick={() => {
              const newState = !showStats
              setShowStats(newState)
              if (newState && selectedChild) loadStats(selectedChild.id)
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#8b5cf6',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            📊 {showStats ? '收起热力图' : '查看打卡热力图'}
          </button>
          {showStats && (
            <div style={{ marginTop: '12px', padding: '8px' }}>
              {heatmapData.length === 0 ? (
                <p style={{ color: '#888', fontSize: '14px', textAlign: 'center' }}>
                  暂无打卡数据，快去打卡吧！🎯
                </p>
              ) : (
                <>
                  <HeatMap
                    startDate={new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)}
                    endDate={new Date()}
                    values={heatmapData}
                    classForValue={(value: any) => {
                      if (!value || value.count === 0) return 'color-empty'
                      if (value.count <= 2) return 'color-scale-1'
                      if (value.count <= 4) return 'color-scale-2'
                      if (value.count <= 6) return 'color-scale-3'
                      return 'color-scale-4'
                    }}
                    gutterSize={4}
                  />
                  <style>{`
                    .react-calendar-heatmap .color-empty { fill: #ebedf0; }
                    .react-calendar-heatmap .color-scale-1 { fill: #9be9a8; }
                    .react-calendar-heatmap .color-scale-2 { fill: #40c463; }
                    .react-calendar-heatmap .color-scale-3 { fill: #30a14e; }
                    .react-calendar-heatmap .color-scale-4 { fill: #216e39; }
                    .react-calendar-heatmap rect:hover { stroke: #555; stroke-width: 1px; }
                  `}</style>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    gap: '4px', 
                    marginTop: '4px',
                    fontSize: '12px',
                    color: '#888',
                    alignItems: 'center'
                  }}>
                    <span>少</span>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#ebedf0" rx="2"/></svg>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#9be9a8" rx="2"/></svg>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#40c463" rx="2"/></svg>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#30a14e" rx="2"/></svg>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#216e39" rx="2"/></svg>
                    <span>多</span>
                  </div>
                  <p style={{ 
                    fontSize: '12px', 
                    color: '#aaa', 
                    textAlign: 'center', 
                    marginTop: '4px' 
                  }}>
                    最近365天打卡记录 · 总共 {heatmapData.reduce((sum, d) => sum + d.count, 0)} 次
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 消息 */}
      {message && (
        <p style={{
          marginTop: '12px',
          padding: '8px 12px',
          borderRadius: '6px',
          background: message.includes('✅') ? '#d1fae5' : '#fee2e2',
          color: message.includes('✅') ? '#065f46' : '#991b1b',
          fontSize: '14px',
        }}>
          {message}
        </p>
      )}
    </div>
  )
}

export default App