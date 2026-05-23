/**
 * Mellow Tracker - JavaScript Logic
 * Modern Minimalist Assignment Tracker with Brown Theme & Light/Dark Mode
 * Connected to Supabase Cloud Database with LocalStorage Fallback & High Resilience
 */

import { createClient } from '@supabase/supabase-js';

// ==========================================================================
// 0. Configuration & Connection Checks (Safe initialization)
// ==========================================================================
let supabase = null;
let isSupabaseConfigured = false;

try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // ตรวจสอบคีย์อย่างละเอียด รวมถึงกรณีที่ Vite แทนที่ด้วยสตริงเปล่าหรือคำว่า "undefined"
    isSupabaseConfigured = 
        supabaseUrl && 
        supabaseAnonKey && 
        supabaseUrl !== 'undefined' && 
        supabaseAnonKey !== 'undefined' && 
        supabaseUrl !== 'null' && 
        supabaseAnonKey !== 'null' && 
        supabaseUrl !== '' &&
        supabaseUrl !== 'https://your-project-id.supabase.co' && 
        supabaseAnonKey !== 'your-anon-key-here';

    if (isSupabaseConfigured) {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
} catch (e) {
    console.error("Mellow Tracker: Supabase initialization failed, falling back to LocalStorage:", e);
    isSupabaseConfigured = false;
}

// ==========================================================================
// 1. Data Repositories
// ==========================================================================

// Local Storage Repository
class LocalStorageTaskRepository {
    constructor() {
        this.STORAGE_KEY = 'mellow_tasks_data';
    }

    async getAll() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    async saveAll(tasks) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(tasks));
    }

    async add(task) {
        const tasks = await this.getAll();
        tasks.push(task);
        await this.saveAll(tasks);
        return task;
    }

    async update(id, updatedFields) {
        const tasks = await this.getAll();
        const index = tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            tasks[index] = { ...tasks[index], ...updatedFields };
            await this.saveAll(tasks);
            return tasks[index];
        }
        throw new Error(`Task with id ${id} not found.`);
    }

    async delete(id) {
        const tasks = await this.getAll();
        const filtered = tasks.filter(t => t.id !== id);
        await this.saveAll(filtered);
        return true;
    }
}

// Supabase Cloud Repository
class SupabaseTaskRepository {
    async getAll() {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        return data.map(item => ({
            id: item.id,
            title: item.title,
            dueDate: item.due_date,
            subject: item.subject,
            completed: item.completed,
            createdAt: item.created_at
        }));
    }

    async add(task) {
        const { data, error } = await supabase
            .from('tasks')
            .insert([{
                title: task.title,
                due_date: task.dueDate,
                subject: task.subject,
                completed: task.completed
            }])
            .select();
            
        if (error) throw error;
        
        return {
            id: data[0].id,
            title: data[0].title,
            dueDate: data[0].due_date,
            subject: data[0].subject,
            completed: data[0].completed,
            createdAt: data[0].created_at
        };
    }

    async update(id, updatedFields) {
        const dbFields = {};
        if (updatedFields.title !== undefined) dbFields.title = updatedFields.title;
        if (updatedFields.dueDate !== undefined) dbFields.due_date = updatedFields.dueDate;
        if (updatedFields.subject !== undefined) dbFields.subject = updatedFields.subject;
        if (updatedFields.completed !== undefined) dbFields.completed = updatedFields.completed;

        const { data, error } = await supabase
            .from('tasks')
            .update(dbFields)
            .eq('id', id)
            .select();
            
        if (error) throw error;
        
        return {
            id: data[0].id,
            title: data[0].title,
            dueDate: data[0].due_date,
            subject: data[0].subject,
            completed: data[0].completed,
            createdAt: data[0].created_at
        };
    }

    async delete(id) {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        return true;
    }
}

// เลือกรีโพซิทอรีตามการตั้งค่าความปลอดภัย
const db = isSupabaseConfigured ? new SupabaseTaskRepository() : new LocalStorageTaskRepository();

// ==========================================================================
// 2. Main Application Controller
// ==========================================================================
class MellowApp {
    constructor() {
        this.tasks = [];
        this.subjects = []; 
        this.currentFilter = 'all'; 
        this.currentSort = 'created-desc'; 
        this.theme = 'light';

        // DOM Elements
        this.themeToggleBtn = document.getElementById('theme-toggle');
        this.taskForm = document.getElementById('task-form');
        this.taskInput = document.getElementById('task-input');
        this.taskDueDate = document.getElementById('task-due-date');
        this.taskSubject = document.getElementById('task-subject');
        this.taskList = document.getElementById('task-list');
        this.emptyState = document.getElementById('empty-state');
        this.sortSelect = document.getElementById('sort-select');
        
        // Filter tabs
        this.filterTabsContainer = document.getElementById('filter-tabs-container');
        this.badgeAll = document.getElementById('badge-all');
        this.badgeActive = document.getElementById('badge-active');
        this.badgeCompleted = document.getElementById('badge-completed');

        // Progress bar elements
        this.progressBar = document.getElementById('progress-bar');
        this.progressTextSummary = document.getElementById('progress-text-summary');
        this.progressTextCount = document.getElementById('progress-text-count');
    }

    async init() {
        this.initTheme();
        this.setDefaultDate();
        this.updateConnectionStatus();
        this.setupEventListeners();
        
        // 1. โหลดรายวิชาเริ่มต้น (Default) ไว้ก่อนทันทีเพื่อป้องกันหน้าจอค้าง
        this.loadDefaultSubjects();
        this.renderSubjectDropdown();
        
        // 2. ดึงข้อมูลงานเบื้องต้นมาแสดงผลก่อน
        await this.loadTasks();

        // 3. ค่อยรันงานดึงวิชาและฟังก์ชัน Realtime จากคลาวด์ในเบื้องหลัง
        if (isSupabaseConfigured && supabase) {
            this.setupRealtime();
            this.syncSubjectsFromCloud(); // ไม่ใส่ await เพื่อไม่ให้บล็อกการแสดงผลหลัก
        }
    }

    // Initialize Theme
    initTheme() {
        const savedTheme = localStorage.getItem('mellow_theme');
        if (savedTheme) {
            this.theme = savedTheme;
        } else {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.theme = systemPrefersDark ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', this.theme);
    }

    // Toggle theme
    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.theme);
        localStorage.setItem('mellow_theme', this.theme);
    }

    // Show connection mode to user
    updateConnectionStatus() {
        const statusText = document.getElementById('connection-status');
        if (statusText) {
            if (isSupabaseConfigured) {
                statusText.innerHTML = '<i class="fa-solid fa-cloud" style="color: var(--color-accent);"></i> เชื่อมต่อฐานข้อมูลคลาวด์ Supabase แล้ว';
            } else {
                statusText.innerHTML = '<i class="fa-solid fa-database"></i> โหมดออฟไลน์ (Local Storage) • ตั้งค่าไฟล์ .env เพื่อซิงค์ขึ้นคลาวด์';
            }
        }
    }

    // Default due date to tomorrow's date
    setDefaultDate() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yyyy = tomorrow.getFullYear();
        const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd = String(tomorrow.getDate()).padStart(2, '0');
        this.taskDueDate.value = `${yyyy}-${mm}-${dd}`;
    }

    // Default subjects array
    loadDefaultSubjects() {
        this.subjects = [
            { id: 'general', name: 'ทั่วไป', emoji: '☕' },
            { id: 'math', name: 'คณิตศาสตร์', emoji: '📐' },
            { id: 'science', name: 'วิทยาศาสตร์', emoji: '🔬' },
            { id: 'english', name: 'ภาษาอังกฤษ', emoji: '🇬🇧' },
            { id: 'thai', name: 'ภาษาไทย', emoji: '🇹🇭' },
            { id: 'design', name: 'ศิลปะ/ดีไซน์', emoji: '🎨' },
            { id: 'computer', name: 'คอมพิวเตอร์', emoji: '💻' }
        ];
    }

    // Sync subjects list from Supabase
    async syncSubjectsFromCloud() {
        try {
            const { data, error } = await supabase
                .from('subjects')
                .select('*')
                .order('name');
                
            if (error) throw error;
            if (data && data.length > 0) {
                this.subjects = data;
                this.renderSubjectDropdown();
                this.render(); // รีเรนเดอร์อีกครั้งเพื่อให้ป้ายชื่อแสดงผลตามฐานข้อมูลคลาวด์
            }
        } catch (err) {
            console.error("Mellow Tracker: Error syncing subjects from Supabase, using offline defaults:", err);
        }
    }

    // Populate dropdown selection
    renderSubjectDropdown() {
        if (!this.taskSubject) return;
        this.taskSubject.innerHTML = '';
        
        this.subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.id;
            opt.textContent = `${sub.name} ${sub.emoji}`;
            if (sub.id === 'general') opt.selected = true;
            this.taskSubject.appendChild(opt);
        });
    }

    // Setup event listeners
    setupEventListeners() {
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        this.taskForm.addEventListener('submit', (e) => this.handleSubmit(e));

        this.filterTabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.filter-tab');
            if (!tab) return;
            
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            this.currentFilter = tab.dataset.filter;
            this.render();
        });

        this.sortSelect.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.render();
        });

        this.taskList.addEventListener('click', (e) => {
            const taskItem = e.target.closest('.task-item');
            if (!taskItem) return;
            const taskId = taskItem.dataset.id;

            if (e.target.closest('.checkbox-container')) {
                const checkbox = taskItem.querySelector('input[type="checkbox"]');
                this.toggleTaskStatus(taskId, checkbox.checked);
            }

            if (e.target.closest('.btn-icon')) {
                this.deleteTaskWithAnimation(taskItem, taskId);
            }
        });
    }

    // Load tasks from DB
    async loadTasks() {
        try {
            this.tasks = await db.getAll();
        } catch (err) {
            console.error("Mellow Tracker: Error loading tasks from database:", err);
            
            // กรณีคีย์เชื่อมต่อผิดพลาดและเรียกข้อมูลคลาวด์ไม่ได้ ให้กู้ข้อมูล local มาทำงานแทนไม่ให้บอร์ดว่างเปล่า
            if (isSupabaseConfigured) {
                console.log("Mellow Tracker: Database request failed. Falling back to local storage offline tasks...");
                const localDb = new LocalStorageTaskRepository();
                this.tasks = await localDb.getAll();
            }
        }
        this.render();
    }

    // Handle form submit to add new task
    async handleSubmit(e) {
        e.preventDefault();
        
        const title = this.taskInput.value.trim();
        const dueDate = this.taskDueDate.value;
        const subject = this.taskSubject.value;

        if (!title || !dueDate) return;

        const newTask = {
            id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            title,
            dueDate,
            subject,
            completed: false,
            createdAt: new Date().toISOString()
        };

        try {
            const addedTask = await db.add(newTask);
            this.tasks.push(addedTask);
            
            this.taskInput.value = '';
            this.taskInput.focus();
            this.setDefaultDate();
            
            this.render();
        } catch (err) {
            console.error("Error saving task:", err);
            
            // กรณีเขียนข้อมูลคลาวด์ล้มเหลว ให้บันทึกลง local storage แก้ขัดไปก่อนเพื่อความต่อเนื่อง
            console.log("Saving task to offline storage fallback...");
            const localDb = new LocalStorageTaskRepository();
            const fallbackTask = await localDb.add(newTask);
            this.tasks.push(fallbackTask);
            this.render();
        }
    }

    // Toggle task completed state
    async toggleTaskStatus(id, isCompleted) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = isCompleted;
            try {
                await db.update(id, { completed: isCompleted });
                setTimeout(() => {
                    this.render();
                }, 200);
            } catch (err) {
                console.error("Error updating status:", err);
                // ตรวจเช็คว่าอัพเดตผ่าน LocalStorage แก้ขัดได้หรือไม่
                const localDb = new LocalStorageTaskRepository();
                try {
                    await localDb.update(id, { completed: isCompleted });
                } catch(e) {}
                setTimeout(() => {
                    this.render();
                }, 200);
            }
        }
    }

    // Perform smooth deletion with CSS animation
    async deleteTaskWithAnimation(taskItemElement, id) {
        taskItemElement.classList.add('removing');
        
        taskItemElement.addEventListener('animationend', async () => {
            try {
                await db.delete(id);
                this.tasks = this.tasks.filter(t => t.id !== id);
                this.render();
            } catch (err) {
                console.error("Error deleting task:", err);
                
                // ลองลบใน local แก้ขัด
                const localDb = new LocalStorageTaskRepository();
                try { await localDb.delete(id); } catch(e) {}
                
                this.tasks = this.tasks.filter(t => t.id !== id);
                this.render();
            }
        }, { once: true });
    }

    // Check if task is overdue
    isOverdue(dueDateStr, isCompleted) {
        if (isCompleted) return false;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const parts = dueDateStr.split('-');
        if (parts.length !== 3) return false;
        const due = new Date(parts[0], parts[1] - 1, parts[2]);
        due.setHours(0, 0, 0, 0);
        
        return due < today;
    }

    // Format Date string in Thai style
    formatThaiDate(dueDateStr) {
        const parts = dueDateStr.split('-');
        if (parts.length !== 3) return dueDateStr;
        
        const year = parseInt(parts[0]);
        const monthIndex = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        
        const thaiMonthsShort = [
            'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
            'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
        ];
        
        const thaiYear = year + 543;
        return `${day} ${thaiMonthsShort[monthIndex]} ${thaiYear}`;
    }

    // Translate subject ID to Thai label
    getSubjectLabel(subjectId) {
        const found = this.subjects.find(s => s.id === subjectId);
        return found ? `${found.name} ${found.emoji}` : 'ทั่วไป ☕';
    }

    // Filter tasks
    getFilteredTasks() {
        return this.tasks.filter(task => {
            if (this.currentFilter === 'active') return !task.completed;
            if (this.currentFilter === 'completed') return task.completed;
            return true;
        });
    }

    // Sort tasks
    getSortedTasks(filteredTasks) {
        return [...filteredTasks].sort((a, b) => {
            if (this.currentSort === 'dueDate-asc') {
                return a.dueDate.localeCompare(b.dueDate);
            }
            if (this.currentSort === 'dueDate-desc') {
                return b.dueDate.localeCompare(a.dueDate);
            }
            if (this.currentSort === 'subject-asc') {
                const subA = this.getSubjectLabel(a.subject || 'general');
                const subB = this.getSubjectLabel(b.subject || 'general');
                return subA.localeCompare(subB, 'th');
            }
            if (this.currentSort === 'created-desc') {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            return 0;
        });
    }

    // Update progress bar UI
    updateProgressUI() {
        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.completed).length;
        
        this.badgeAll.textContent = total;
        this.badgeActive.textContent = this.tasks.filter(t => !t.completed).length;
        this.badgeCompleted.textContent = completed;

        if (total === 0) {
            this.progressBar.style.width = '0%';
            this.progressTextSummary.textContent = 'เริ่มต้นวันใหม่ด้วยสมาธิที่ดี! ☕';
            this.progressTextCount.textContent = '0 จาก 0 งาน';
            return;
        }

        const percentage = Math.round((completed / total) * 100);
        this.progressBar.style.width = `${percentage}%`;
        this.progressTextCount.textContent = `${completed} จาก ${total} งาน`;

        if (percentage === 100) {
            this.progressTextSummary.textContent = 'ยอดเยี่ยมมาก! เคลียร์งานหมดแล้ว 🎉';
        } else if (percentage >= 70) {
            this.progressTextSummary.textContent = 'ใกล้เสร็จแล้ว! อีกนิดเดียวเท่านั้น 💪';
        } else if (percentage >= 40) {
            this.progressTextSummary.textContent = 'ทำเสร็จไปได้เยอะแล้ว! สู้ๆ ต่อไปนะ ✨';
        } else if (percentage > 0) {
            this.progressTextSummary.textContent = 'กำลังเริ่มต้นได้ดี! โฟกัสและก้าวต่อทีละนิด ☕';
        } else {
            this.progressTextSummary.textContent = 'มีงานรออยู่... มาเริ่มลุยกันเลย! ✍️';
        }
    }

    // Render list
    render() {
        this.updateProgressUI();

        const filteredTasks = this.getFilteredTasks();
        const sortedTasks = this.getSortedTasks(filteredTasks);

        this.taskList.innerHTML = '';

        if (sortedTasks.length === 0) {
            this.emptyState.style.display = 'flex';
            this.taskList.style.display = 'none';
        } else {
            this.emptyState.style.display = 'none';
            this.taskList.style.display = 'flex';

            sortedTasks.forEach(task => {
                const isOverdue = this.isOverdue(task.dueDate, task.completed);
                const formattedDate = this.formatThaiDate(task.dueDate);
                
                const taskLi = document.createElement('li');
                taskLi.className = `task-item ${task.completed ? 'completed' : ''}`;
                taskLi.dataset.id = task.id;

                const subjectLabel = this.getSubjectLabel(task.subject || 'general');

                taskLi.innerHTML = `
                    <div class="task-left">
                        <label class="checkbox-container">
                            <input type="checkbox" ${task.completed ? 'checked' : ''} aria-label="ทำเครื่องหมายว่าเสร็จแล้ว">
                            <span class="checkmark"></span>
                        </label>
                        <div class="task-details">
                            <span class="task-title">${this.escapeHTML(task.title)}</span>
                            <div class="task-meta">
                                <span class="task-due ${isOverdue ? 'overdue' : ''}">
                                    <i class="fa-regular fa-calendar"></i> 
                                    ${isOverdue ? 'เลยกำหนดส่ง: ' : 'ส่งภายใน: '} ${formattedDate}
                                </span>
                                <span class="subject-badge">${subjectLabel}</span>
                            </div>
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="btn-icon" aria-label="ลบงาน" title="ลบงาน">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;
                
                this.taskList.appendChild(taskLi);
            });
        }
    }

    // Subscribe to Supabase Realtime changes
    setupRealtime() {
        if (!isSupabaseConfigured || !supabase) return;

        supabase
            .channel('public:tasks')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tasks' },
                (payload) => {
                    const eventType = payload.eventType;
                    
                    if (eventType === 'INSERT') {
                        const newTask = this.mapDbTask(payload.new);
                        if (!this.tasks.some(t => t.id === newTask.id)) {
                            this.tasks.push(newTask);
                        }
                    } else if (eventType === 'UPDATE') {
                        const updatedTask = this.mapDbTask(payload.new);
                        const idx = this.tasks.findIndex(t => t.id === updatedTask.id);
                        if (idx !== -1) {
                            this.tasks[idx] = updatedTask;
                        }
                    } else if (eventType === 'DELETE') {
                        const deletedId = payload.old.id;
                        this.tasks = this.tasks.filter(t => t.id !== deletedId);
                    }
                    
                    this.render();
                }
            )
            .subscribe();
    }

    escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }
}

// Initialize application on DOM content load
document.addEventListener('DOMContentLoaded', () => {
    const app = new MellowApp();
    app.init();
});
