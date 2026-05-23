/**
 * Mellow Tracker - JavaScript Logic
 * Modern Minimalist Assignment Tracker with Brown Theme & Light/Dark Mode
 * Connected to Supabase Cloud Database with LocalStorage Fallback & High Resilience
 * Features: PWA Offline support, SVG Progress Ring, Confetti on Complete, Dynamic Subject Creator Modal
 */

import { createClient } from '@supabase/supabase-js';
import confetti from 'canvas-confetti';

// ==========================================================================
// 0. Configuration & Connection Checks (Safe initialization)
// ==========================================================================
let supabase = null;
let isSupabaseConfigured = false;

try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // ตรวจสอบคีย์ความลับ รวมถึงกรณีที่ Vite แทนที่ด้วยสตริงเปล่าหรือคำว่า "undefined"
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

// Local Storage Repository (โหมดออฟไลน์)
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

// Supabase Cloud Repository (โหมดออนไลน์คลาวด์)
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

        // SVG Progress Ring Elements
        this.progressRingFill = document.getElementById('progress-ring-fill');
        this.progressPercentLabel = document.getElementById('progress-percent-label');
        
        // Header & Progress text elements
        this.progressTextSummary = document.getElementById('progress-text-summary');
        this.progressTextCount = document.getElementById('progress-text-count');

        // Subject Modal Elements
        this.manageSubjectsBtn = document.getElementById('manage-subjects-btn');
        this.subjectModal = document.getElementById('subject-modal');
        this.closeSubjectModalBtn = document.getElementById('close-subject-modal');
        this.addSubjectForm = document.getElementById('add-subject-form');
        this.newSubjectName = document.getElementById('new-subject-name');
        this.modalSubjectsList = document.getElementById('modal-subjects-list');

        // Custom Select Elements
        this.customSubjectWrapper = document.getElementById('custom-subject-wrapper');
        this.customSubjectTrigger = document.getElementById('custom-subject-trigger');
        this.customSubjectTriggerText = this.customSubjectTrigger?.querySelector('.custom-select-trigger-text');
        this.customSubjectOptions = document.getElementById('custom-subject-options');

        this.customSortWrapper = document.getElementById('custom-sort-wrapper');
        this.customSortTrigger = document.getElementById('custom-sort-trigger');
        this.customSortTriggerText = this.customSortTrigger?.querySelector('.custom-select-trigger-text');
        this.customSortOptions = document.getElementById('custom-sort-options');

        // Custom Date Picker Elements
        this.customDateWrapper = document.getElementById('custom-date-wrapper');
        this.customDateTrigger = document.getElementById('custom-date-trigger');
        this.customDateText = document.getElementById('custom-date-text');
        this.calendarDaysGrid = document.getElementById('calendar-days-grid');
        this.calMonthYear = document.getElementById('cal-month-year');
        this.calPrevMonth = document.getElementById('cal-prev-month');
        this.calNextMonth = document.getElementById('cal-next-month');
        this.calendarCurrentDate = new Date();
    }

    async init() {
        this.initTheme();
        this.setDefaultDate();
        this.updateConnectionStatus();
        this.setupEventListeners();
        this.registerServiceWorker(); // เปิดลงทะเบียน PWA Offline Mode
        
        // 1. โหลดรายวิชาเริ่มต้น (Default) ไว้ก่อนทันทีเพื่อป้องกันหน้าจอค้าง
        this.loadDefaultSubjects();
        this.renderSubjectDropdown();
        
        // 2. ดึงข้อมูลงานเบื้องต้นมาแสดงผลก่อน
        await this.loadTasks();

        // 3. ค่อยรันงานดึงวิชาและฟังก์ชัน Realtime จากคลาวด์ในเบื้องหลัง
        if (isSupabaseConfigured && supabase) {
            this.setupRealtime();
            this.syncSubjectsFromCloud(); 
        }
    }

    // Register Service Worker for PWA
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                // รันการลงทะเบียนไฟล์ sw.js
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Mellow PWA: Service Worker registered successfully', reg.scope))
                    .catch(err => console.error('Mellow PWA: Service Worker registration failed', err));
            });
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
        this.updateCustomDateText();
    }

    // Update Custom Date trigger text
    updateCustomDateText() {
        if (!this.customDateText || !this.taskDueDate) return;
        const val = this.taskDueDate.value;
        if (val) {
            this.customDateText.textContent = this.formatThaiDate(val);
        } else {
            this.customDateText.textContent = 'เลือกวันส่ง...';
        }
    }

    // Render Custom Calendar
    renderCalendar() {
        if (!this.calendarDaysGrid || !this.calMonthYear) return;

        const year = this.calendarCurrentDate.getFullYear();
        const month = this.calendarCurrentDate.getMonth();

        const thaiMonths = [
            'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
        ];
        this.calMonthYear.textContent = `${thaiMonths[month]} ${year + 543}`;

        this.calendarDaysGrid.innerHTML = '';

        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDayIndex; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'calendar-day empty';
            this.calendarDaysGrid.appendChild(emptyDiv);
        }

        let selectedDateStr = this.taskDueDate.value;
        let selYear = null, selMonth = null, selDay = null;
        if (selectedDateStr) {
            const parts = selectedDateStr.split('-');
            selYear = parseInt(parts[0]);
            selMonth = parseInt(parts[1]) - 1;
            selDay = parseInt(parts[2]);
        }

        const today = new Date();

        for (let day = 1; day <= totalDays; day++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.textContent = day;

            if (selYear === year && selMonth === month && selDay === day) {
                dayDiv.classList.add('selected');
            }

            if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day) {
                dayDiv.classList.add('today');
            }

            dayDiv.addEventListener('click', () => {
                const mmStr = String(month + 1).padStart(2, '0');
                const ddStr = String(day).padStart(2, '0');
                const finalDateStr = `${year}-${mmStr}-${ddStr}`;

                this.taskDueDate.value = finalDateStr;
                this.updateCustomDateText();

                this.customDateWrapper?.classList.remove('open');
                this.renderCalendar();
            });

            this.calendarDaysGrid.appendChild(dayDiv);
        }
    }

    // Default subjects array
    loadDefaultSubjects() {
        const saved = localStorage.getItem('mellow_subjects_data');
        if (saved) {
            this.subjects = JSON.parse(saved);
        } else {
            this.subjects = [
                { id: 'general', name: 'ทั่วไป', emoji: '' },
                { id: 'math', name: 'คณิตศาสตร์', emoji: '' },
                { id: 'science', name: 'วิทยาศาสตร์', emoji: '' },
                { id: 'english', name: 'ภาษาอังกฤษ', emoji: '' },
                { id: 'thai', name: 'ภาษาไทย', emoji: '' },
                { id: 'design', name: 'ศิลปะ/ดีไซน์', emoji: '' },
                { id: 'computer', name: 'คอมพิวเตอร์', emoji: '' }
            ];
            this.saveLocalSubjects(this.subjects);
        }
    }

    // Save subjects list locally in LocalStorage
    saveLocalSubjects(subjectsList) {
        localStorage.setItem('mellow_subjects_data', JSON.stringify(subjectsList));
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
                this.render(); 
            }
        } catch (err) {
            console.error("Mellow Tracker: Error syncing subjects from Supabase, using offline defaults:", err);
        }
    }

    // Populate dropdown selection
    renderSubjectDropdown() {
        if (!this.taskSubject) return;
        this.taskSubject.innerHTML = '';
        
        if (this.customSubjectOptions) {
            this.customSubjectOptions.innerHTML = '';
        }

        const currentValue = this.taskSubject.value || 'general';
        
        this.subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.id;
            opt.textContent = sub.name;
            if (sub.id === currentValue) opt.selected = true;
            this.taskSubject.appendChild(opt);

            if (this.customSubjectOptions) {
                const div = document.createElement('div');
                div.className = `custom-option${sub.id === currentValue ? ' selected' : ''}`;
                div.dataset.value = sub.id;
                div.textContent = sub.name;
                this.customSubjectOptions.appendChild(div);
            }
        });

        const currentSub = this.subjects.find(s => s.id === currentValue);
        if (this.customSubjectTriggerText) {
            this.customSubjectTriggerText.textContent = currentSub ? currentSub.name : 'ทั่วไป';
        }
    }

    // Setup event listeners
    setupEventListeners() {
        this.setupCustomSelects();
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

        // Event listeners สำหรับ Subject Creator Modal
        if (this.manageSubjectsBtn) {
            this.manageSubjectsBtn.addEventListener('click', () => this.openSubjectModal());
        }

        if (this.closeSubjectModalBtn) {
            this.closeSubjectModalBtn.addEventListener('click', () => this.closeSubjectModal());
        }

        if (this.subjectModal) {
            this.subjectModal.addEventListener('click', (e) => {
                if (e.target === this.subjectModal) this.closeSubjectModal();
            });
        }

        if (this.addSubjectForm) {
            this.addSubjectForm.addEventListener('submit', (e) => this.handleAddSubject(e));
        }

        if (this.modalSubjectsList) {
            this.modalSubjectsList.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.btn-icon-delete');
                if (deleteBtn) {
                    const subjectId = deleteBtn.dataset.id;
                    this.handleDeleteSubject(subjectId);
                }
            });
        }
    }

    // Setup Custom Dropdowns
    setupCustomSelects() {
        // Toggle Subject Select open/close
        if (this.customSubjectTrigger) {
            this.customSubjectTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.customSortWrapper?.classList.remove('open');
                this.customDateWrapper?.classList.remove('open');
                this.customSubjectWrapper?.classList.toggle('open');
            });
        }

        // Toggle Sort Select open/close
        if (this.customSortTrigger) {
            this.customSortTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.customSubjectWrapper?.classList.remove('open');
                this.customDateWrapper?.classList.remove('open');
                this.customSortWrapper?.classList.toggle('open');
            });
        }

        // Toggle Date Picker open/close
        if (this.customDateTrigger) {
            this.customDateTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.customSubjectWrapper?.classList.remove('open');
                this.customSortWrapper?.classList.remove('open');
                const isOpen = this.customDateWrapper?.classList.toggle('open');
                if (isOpen) {
                    let currentVal = this.taskDueDate.value;
                    if (currentVal) {
                        const parts = currentVal.split('-');
                        this.calendarCurrentDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
                    } else {
                        this.calendarCurrentDate = new Date();
                    }
                    this.renderCalendar();
                }
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            this.customSubjectWrapper?.classList.remove('open');
            this.customSortWrapper?.classList.remove('open');
            this.customDateWrapper?.classList.remove('open');
        });

        // Prev Month click
        if (this.calPrevMonth) {
            this.calPrevMonth.addEventListener('click', (e) => {
                e.stopPropagation();
                this.calendarCurrentDate.setMonth(this.calendarCurrentDate.getMonth() - 1);
                this.renderCalendar();
            });
        }

        // Next Month click
        if (this.calNextMonth) {
            this.calNextMonth.addEventListener('click', (e) => {
                e.stopPropagation();
                this.calendarCurrentDate.setMonth(this.calendarCurrentDate.getMonth() + 1);
                this.renderCalendar();
            });
        }

        // Prevent clicking inside date picker container from closing it
        const datePickerContainer = document.getElementById('custom-date-picker');
        if (datePickerContainer) {
            datePickerContainer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Click handler for Sort options
        if (this.customSortOptions) {
            this.customSortOptions.addEventListener('click', (e) => {
                const option = e.target.closest('.custom-option');
                if (!option) return;

                const val = option.dataset.value;
                const text = option.textContent;

                // Update trigger text
                if (this.customSortTriggerText) {
                    this.customSortTriggerText.textContent = text;
                }

                // Update selected class
                this.customSortOptions.querySelectorAll('.custom-option').forEach(opt => {
                    opt.classList.toggle('selected', opt === option);
                });

                // Update native select and trigger event
                if (this.sortSelect) {
                    this.sortSelect.value = val;
                    this.sortSelect.dispatchEvent(new Event('change'));
                }

                this.customSortWrapper?.classList.remove('open');
            });
        }

        // Click handler for Subject options
        if (this.customSubjectOptions) {
            this.customSubjectOptions.addEventListener('click', (e) => {
                const option = e.target.closest('.custom-option');
                if (!option) return;

                const val = option.dataset.value;
                const text = option.textContent;

                // Update trigger text
                if (this.customSubjectTriggerText) {
                    this.customSubjectTriggerText.textContent = text;
                }

                // Update selected class
                this.customSubjectOptions.querySelectorAll('.custom-option').forEach(opt => {
                    opt.classList.toggle('selected', opt === option);
                });

                // Update native select
                if (this.taskSubject) {
                    this.taskSubject.value = val;
                }

                this.customSubjectWrapper?.classList.remove('open');
            });
        }
    }

    // Modal Control Methods
    openSubjectModal() {
        if (this.subjectModal) {
            this.subjectModal.classList.add('active');
            this.renderModalSubjectsList();
        }
    }

    closeSubjectModal() {
        if (this.subjectModal) {
            this.subjectModal.classList.remove('active');
        }
    }

    renderModalSubjectsList() {
        if (!this.modalSubjectsList) return;
        this.modalSubjectsList.innerHTML = '';

        this.subjects.forEach(sub => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="subject-info-item">
                    <span>${sub.name}</span>
                </div>
                ${sub.id !== 'general' ? `
                    <button class="btn-icon-delete" data-id="${sub.id}" title="ลบรายวิชา" aria-label="ลบรายวิชา">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                ` : ''}
            `;
            this.modalSubjectsList.appendChild(li);
        });
    }

    // Add Subject via Modal
    async handleAddSubject(e) {
        e.preventDefault();
        const name = this.newSubjectName.value.trim();

        if (!name) return;

        // สร้าง ID เสมือน
        const id = 'subj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const newSub = { id, name, emoji: '' };

        try {
            if (isSupabaseConfigured && supabase) {
                const { data, error } = await supabase
                    .from('subjects')
                    .insert([newSub])
                    .select();
                if (error) throw error;
            } else {
                // บันทึกลง LocalStorage
                const updatedList = [...this.subjects, newSub];
                this.saveLocalSubjects(updatedList);
            }

            this.subjects.push(newSub);
            this.renderSubjectDropdown();
            this.renderModalSubjectsList();
            this.render(); // อัปเดตการแสดงผลวิชาการ์ดงาน

            // Reset Inputs
            this.newSubjectName.value = '';

        } catch (err) {
            console.error("Error adding subject:", err);
            alert("ไม่สามารถเพิ่มรายวิชาได้");
        }
    }

    // Delete Subject via Modal
    async handleDeleteSubject(subjectId) {
        if (subjectId === 'general') return;
        
        const confirmDelete = confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายวิชานี้?\n(งานในบอร์ดที่อิงวิชานี้จะถูกตั้งกลับเป็นวิชา 'ทั่วไป' อัตโนมัติ)");
        if (!confirmDelete) return;

        try {
            if (isSupabaseConfigured && supabase) {
                // สั่งลบจากตารางในระบบคลาวด์ (Foreign key references set default จะทำงานให้ใน DB)
                const { error } = await supabase
                    .from('subjects')
                    .delete()
                    .eq('id', subjectId);
                if (error) throw error;
            } else {
                // ออฟไลน์: สลับงานที่มีของวิชานี้กลับเป็นวิชาทั่วไป
                const updatedSubjects = this.subjects.filter(s => s.id !== subjectId);
                this.saveLocalSubjects(updatedSubjects);

                this.tasks.forEach(task => {
                    if (task.subject === subjectId) task.subject = 'general';
                });
                
                const localDb = new LocalStorageTaskRepository();
                await localDb.saveAll(this.tasks);
            }

            // อัปเดตหน้าจอ
            this.subjects = this.subjects.filter(s => s.id !== subjectId);
            this.renderSubjectDropdown();
            this.renderModalSubjectsList();
            this.render();

        } catch (err) {
            console.error("Error deleting subject:", err);
            alert("ไม่สามารถลบรายวิชาได้");
        }
    }

    // Load tasks from DB
    async loadTasks() {
        try {
            this.tasks = await db.getAll();
            
            // อัปเดตสถานะการเชื่อมต่อเมื่อดึงข้อมูลได้สำเร็จ
            const statusText = document.getElementById('connection-status');
            if (statusText && isSupabaseConfigured) {
                statusText.innerHTML = '<i class="fa-solid fa-cloud" style="color: var(--color-accent);"></i> เชื่อมต่อฐานข้อมูลคลาวด์ Supabase แล้ว';
            }
        } catch (err) {
            console.error("Mellow Tracker: Error loading tasks from database:", err);
            
            // แสดงปัญหาข้อผิดพลาดบนหน้าเว็บเพื่อให้ผู้ใช้ตรวจทานได้ง่าย
            const statusText = document.getElementById('connection-status');
            if (statusText && isSupabaseConfigured) {
                statusText.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #d9534f;"></i> เชื่อมต่อฐานข้อมูลล้มเหลว: ${err.message || err}`;
            }
            
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
            
            // เล่นเอฟเฟกต์ Confetti เมื่อเช็คงานสำเร็จ
            if (isCompleted) {
                this.triggerConfetti();
            }

            try {
                await db.update(id, { completed: isCompleted });
                setTimeout(() => {
                    this.render();
                }, 200);
            } catch (err) {
                console.error("Error updating status:", err);
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

    // Confetti Animation Effect
    triggerConfetti() {
        const colors = ['#614033', '#8C5F40', '#D7CCC8', '#F5EDE8'];
        confetti({
            particleCount: 80,
            spread: 55,
            origin: { y: 0.8 },
            colors: colors
        });
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
        return found ? found.name : 'ทั่วไป';
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

    // Update SVG Progress Ring UI
    updateProgressUI() {
        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.completed).length;
        
        this.badgeAll.textContent = total;
        this.badgeActive.textContent = this.tasks.filter(t => !t.completed).length;
        this.badgeCompleted.textContent = completed;

        // ความยาวเส้นรอบวง SVG = 2 * pi * r = 2 * 3.14159 * 26 = 163.36
        const circumference = 163.36;

        if (total === 0) {
            if (this.progressRingFill) {
                this.progressRingFill.style.strokeDashoffset = circumference;
            }
            if (this.progressPercentLabel) {
                this.progressPercentLabel.textContent = '0%';
            }
            this.progressTextSummary.textContent = 'เริ่มต้นวันใหม่ด้วยสมาธิที่ดี! ☕';
            this.progressTextCount.textContent = '0 จาก 0 งาน';
            return;
        }

        const percentage = Math.round((completed / total) * 100);
        
        // คำนวณ offset การวาดเส้นวงกลมความก้าวหน้า
        if (this.progressRingFill) {
            const offset = circumference - (percentage / 100) * circumference;
            this.progressRingFill.style.strokeDashoffset = offset;
        }
        if (this.progressPercentLabel) {
            this.progressPercentLabel.textContent = `${percentage}%`;
        }

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

        // ติดตามตาราง Tasks
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

        // ติดตามตาราง Subjects
        supabase
            .channel('public:subjects')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'subjects' },
                async () => {
                    // โหลดวิชาใหม่ทั้งหมดแบบเรียลไทม์ข้ามเครื่อง
                    await this.syncSubjectsFromCloud();
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
