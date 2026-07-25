import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const app = new Hono()

// ========== 测试路由 ==========
app.get('/', (c) => c.text('✅ 后端 API 运行中！'))

// ========== 用户注册 ==========
app.post('/api/register', async (c) => {
  try {
    const { username, password } = await c.req.json()
    if (!username || !password) return c.json({ error: '用户名和密码不能为空' }, 400)
    if (password.length < 6) return c.json({ error: '密码至少6位' }, 400)

    const { data: existing } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .maybeSingle()
    if (existing) return c.json({ error: '用户名已存在' }, 400)

    const salt = crypto.randomBytes(16).toString('base64')
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const passwordHash = btoa(String.fromCharCode(...hashArray))

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ username, password_hash: passwordHash, salt, iterations: 100000, role: 'parent' })
      .select('id, username, role, created_at')
      .single()
    if (error) return c.json({ error: '注册失败: ' + error.message }, 500)

    return c.json({ success: true, message: '注册成功！', user: newUser }, 201)
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 用户登录 ==========
app.post('/api/login', async (c) => {
  try {
    const { username, password } = await c.req.json()
    if (!username || !password) return c.json({ error: '用户名和密码不能为空' }, 400)

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password_hash, salt, iterations, role')
      .eq('username', username)
      .maybeSingle()
    if (error || !user) return c.json({ error: '用户名或密码错误' }, 401)

    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    const hashBuffer = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(user.salt), iterations: user.iterations, hash: 'SHA-256' }, keyMaterial, 256)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const passwordHash = btoa(String.fromCharCode(...hashArray))

    if (passwordHash !== user.password_hash) return c.json({ error: '用户名或密码错误' }, 401)

    return c.json({ success: true, message: '登录成功！', user: { id: user.id, username: user.username, role: user.role } })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取孩子列表 ==========
app.get('/api/children/:parentId', async (c) => {
  try {
    const parentId = c.req.param('parentId')
    const { data, error } = await supabase.from('children').select('*').eq('parent_id', parentId).order('created_at')
    if (error) return c.json({ error: '查询失败' }, 500)
    return c.json({ success: true, children: data || [] })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 创建孩子 ==========
app.post('/api/children', async (c) => {
  try {
    const { parentId, name, petType } = await c.req.json()
    if (!parentId || !name) return c.json({ error: '家长ID和孩子姓名不能为空' }, 400)

    const { data: parent } = await supabase.from('users').select('id').eq('id', parentId).maybeSingle()
    if (!parent) return c.json({ error: '家长不存在' }, 404)

    const { data: newChild, error } = await supabase
      .from('children')
      .insert({ parent_id: parentId, name, pet_type: petType || 'cat', total_score: 0, pet_level: 0 })
      .select('id, name, pet_type, total_score, pet_level, created_at')
      .single()
    if (error) return c.json({ error: '创建失败: ' + error.message }, 500)

    return c.json({ success: true, message: '孩子档案创建成功！', child: newChild }, 201)
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取任务列表 ==========
app.get('/api/tasks/:parentId', async (c) => {
  try {
    const parentId = c.req.param('parentId')
    const { data, error } = await supabase.from('tasks').select('*').eq('parent_id', parentId).order('created_at', { ascending: false })
    if (error) return c.json({ error: '查询失败' }, 500)
    return c.json({ success: true, tasks: data || [] })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 创建任务 ==========
app.post('/api/tasks', async (c) => {
  try {
    const { parentId, name, category, points, dailyLimit } = await c.req.json()
    if (!parentId || !name || !category || !points) return c.json({ error: '缺少必填字段' }, 400)
    if (points <= 0) return c.json({ error: '分值必须大于0' }, 400)

    const { data: parent } = await supabase.from('users').select('id').eq('id', parentId).maybeSingle()
    if (!parent) return c.json({ error: '家长不存在' }, 404)

    const { data: newTask, error } = await supabase
      .from('tasks')
      .insert({ parent_id: parentId, name, category, points, daily_limit: dailyLimit || 1, is_active: true })
      .select('id, name, category, points, daily_limit, is_active, created_at')
      .single()
    if (error) return c.json({ error: '创建失败: ' + error.message }, 500)

    return c.json({ success: true, message: '任务创建成功！', task: newTask }, 201)
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 打卡 ==========
app.post('/api/checkin', async (c) => {
  try {
    const { childId, taskId } = await c.req.json()
    if (!childId || !taskId) return c.json({ error: '孩子ID和任务ID不能为空' }, 400)

    const { data: task, error: taskErr } = await supabase.from('tasks').select('id, points, daily_limit, is_active').eq('id', taskId).maybeSingle()
    if (taskErr || !task) return c.json({ error: '任务不存在' }, 404)
    if (!task.is_active) return c.json({ error: '该任务已停用' }, 400)

    const { data: child, error: childErr } = await supabase.from('children').select('id, total_score, pet_level').eq('id', childId).maybeSingle()
    if (childErr || !child) return c.json({ error: '孩子档案不存在' }, 404)

    const today = new Date().toISOString().split('T')[0]
    const { data: todayCheckins } = await supabase
      .from('checkins')
      .select('id')
      .eq('child_id', childId)
      .eq('task_id', taskId)
      .gte('created_at', `${today}T00:00:00Z`)
      .lt('created_at', `${today}T23:59:59Z`)

    if (todayCheckins && todayCheckins.length >= task.daily_limit) {
      return c.json({ error: `今日已打卡${todayCheckins.length}次，已达上限` }, 400)
    }

    const oldTotal = child.total_score
    const newTotal = oldTotal + task.points
    const thresholds = [0, 40, 100, 180, 280, 400, 540, 700]
    let newLevel = 0
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (newTotal >= thresholds[i]) { newLevel = i; break }
    }

    const { error: updateErr } = await supabase
      .from('children')
      .update({ total_score: newTotal, pet_level: newLevel })
      .eq('id', childId)
    if (updateErr) return c.json({ error: '更新积分失败' }, 500)

    const { error: insertErr } = await supabase
      .from('checkins')
      .insert({ child_id: childId, task_id: taskId, checkin_date: today, points_earned: task.points, score_before: oldTotal, score_after: newTotal })
    if (insertErr) return c.json({ error: '记录打卡失败' }, 500)

    return c.json({
      success: true,
      message: '打卡成功！',
      data: { pointsEarned: task.points, oldTotal, newTotal, oldLevel: child.pet_level, newLevel, leveledUp: newLevel > child.pet_level }
    })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取打卡记录 ==========
app.get('/api/checkins/:childId', async (c) => {
  try {
    const childId = c.req.param('childId')
    const { data, error } = await supabase
      .from('checkins')
      .select(`*, tasks ( name, category, points )`)
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return c.json({ error: '查询失败' }, 500)
    return c.json({ success: true, checkins: data || [] })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 撤回打卡 ==========
app.delete('/api/checkin/:checkinId', async (c) => {
  try {
    const checkinId = c.req.param('checkinId')
    const { data: checkin, error: qErr } = await supabase.from('checkins').select('*').eq('id', checkinId).maybeSingle()
    if (qErr || !checkin) return c.json({ error: '打卡记录不存在' }, 404)

    const { data: child } = await supabase.from('children').select('id, total_score, pet_level').eq('id', checkin.child_id).maybeSingle()
    if (!child) return c.json({ error: '孩子档案不存在' }, 404)

    const newTotal = Math.max(0, child.total_score - checkin.points_earned)
    const thresholds = [0, 40, 100, 180, 280, 400, 540, 700]
    let newLevel = 0
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (newTotal >= thresholds[i]) { newLevel = i; break }
    }

    await supabase.from('children').update({ total_score: newTotal, pet_level: newLevel }).eq('id', child.id)
    await supabase.from('checkins').delete().eq('id', checkinId)

    return c.json({ success: true, message: '撤回成功！', data: { pointsDeducted: checkin.points_earned, oldTotal: child.total_score, newTotal, oldLevel: child.pet_level, newLevel } })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取打卡统计（热力图） ==========
app.get('/api/checkins/:childId/stats', async (c) => {
  try {
    const childId = c.req.param('childId')
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1)
    const start = startDate.toISOString().split('T')[0]

    const { data: checkins, error } = await supabase
      .from('checkins')
      .select('checkin_date')
      .eq('child_id', childId)
      .gte('checkin_date', start)
    if (error) return c.json({ error: '查询失败' }, 500)

    const dateMap: Record<string, number> = {}
    checkins.forEach((row: any) => {
      const date = row.checkin_date
      dateMap[date] = (dateMap[date] || 0) + 1
    })
    const statsData = Object.entries(dateMap).map(([date, count]) => ({ date, count }))

    return c.json({ success: true, stats: statsData })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 商店奖励 ==========
app.post('/api/rewards', async (c) => {
  try {
    const { parentId, childId, name, cost } = await c.req.json()
    if (!parentId || !name || !cost) return c.json({ error: '缺少必填字段' }, 400)
    if (cost <= 0) return c.json({ error: '积分必须大于0' }, 400)

    const { data: reward, error } = await supabase
      .from('rewards')
      .insert({ parent_id: parentId, child_id: childId || null, name, cost, is_available: true })
      .select('*')
      .single()
    if (error) return c.json({ error: '创建失败' }, 500)
    return c.json({ success: true, message: '奖励创建成功！', reward }, 201)
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

app.get('/api/rewards/:parentId', async (c) => {
  try {
    const parentId = c.req.param('parentId')
    const childId = c.req.query('childId')
    let query = supabase.from('rewards').select('*').eq('parent_id', parentId).eq('is_available', true).order('created_at', { ascending: false })
    if (childId) query = query.or(`child_id.eq.${childId},child_id.is.null`)
    const { data, error } = await query
    if (error) return c.json({ error: '查询失败' }, 500)
    return c.json({ success: true, rewards: data || [] })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

app.post('/api/redeem', async (c) => {
  try {
    const { childId, rewardId } = await c.req.json()
    if (!childId || !rewardId) return c.json({ error: '缺少参数' }, 400)

    const { data: reward } = await supabase.from('rewards').select('*').eq('id', rewardId).eq('is_available', true).maybeSingle()
    if (!reward) return c.json({ error: '奖励不存在' }, 404)

    const { data: child } = await supabase.from('children').select('id, total_score').eq('id', childId).maybeSingle()
    if (!child) return c.json({ error: '孩子不存在' }, 404)
    if (child.total_score < reward.cost) return c.json({ error: '积分不足' }, 400)

    const scoreBefore = child.total_score
    const scoreAfter = scoreBefore - reward.cost

    await supabase.from('children').update({ total_score: scoreAfter }).eq('id', childId)

    const { data: redemption, error } = await supabase
      .from('redemptions')
      .insert({ child_id: childId, reward_id: rewardId, cost: reward.cost, status: 'pending', score_before: scoreBefore, score_after: scoreAfter })
      .select('*')
      .single()
    if (error) {
      await supabase.from('children').update({ total_score: scoreBefore }).eq('id', childId)
      return c.json({ error: '创建兑换记录失败' }, 500)
    }

    return c.json({ success: true, message: '兑换成功！等待审批', redemption, newTotal: scoreAfter })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

app.get('/api/redemptions/:parentId', async (c) => {
  try {
    const parentId = c.req.param('parentId')
    const { data, error } = await supabase
      .from('redemptions')
      .select(`*, children!inner ( id, name, parent_id ), rewards ( id, name, cost )`)
      .eq('children.parent_id', parentId)
      .order('created_at', { ascending: false })
    if (error) return c.json({ error: '查询失败' }, 500)
    return c.json({ success: true, redemptions: data || [] })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

app.put('/api/redemption/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { status } = await c.req.json()
    if (!['approved', 'rejected'].includes(status)) return c.json({ error: '状态错误' }, 400)

    const { data: redemption } = await supabase.from('redemptions').select('*').eq('id', id).maybeSingle()
    if (!redemption) return c.json({ error: '记录不存在' }, 404)
    if (redemption.status !== 'pending') return c.json({ error: '已处理过' }, 400)

    if (status === 'rejected') {
      const { data: child } = await supabase.from('children').select('total_score').eq('id', redemption.child_id).maybeSingle()
      if (child) {
        await supabase.from('children').update({ total_score: child.total_score + redemption.cost }).eq('id', redemption.child_id)
      }
    }

    const updateData: any = { status }
    if (status === 'approved') updateData.approved_at = new Date().toISOString()

    await supabase.from('redemptions').update(updateData).eq('id', id)
    return c.json({ success: true, message: status === 'approved' ? '已批准' : '已拒绝，积分已返还', status })
  } catch (e) {
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

export default app