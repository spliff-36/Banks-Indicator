// Supabase Configuration
// IMPORTANT: Replace these with your actual Supabase project credentials
const SUPABASE_URL = 'https://bpydkinuodatyzkvhfgp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mG8nEd1jLZZUIyxgekQ-eA__ZWdO0Jm';
let supabaseClient;

// App State
const state = {
    user: null,
    profile: null,
    trades: [],
    isAdmin: false,
    adminUsers: [],
    adminTrades: [],
    chartInstance: null,
    filters: {
        date: 'month',
        setup: 'all',
        outcome: 'all'
    },
    sort: {
        column: 'created_at',
        asc: false
    }
};

// DOM Elements
const els = {
    authScreen: document.getElementById('auth-screen'),
    dashboardScreen: document.getElementById('dashboard-screen'),
    authForm: document.getElementById('auth-form'),
    emailInput: document.getElementById('email'),
    passwordInput: document.getElementById('password'),
    btnLogin: document.getElementById('btn-login'),
    btnSignup: document.getElementById('btn-signup'),
    btnLogout: document.getElementById('btn-logout'),
    userEmail: document.getElementById('user-email'),
    userToken: document.getElementById('user-token'),
    btnCopyToken: document.getElementById('btn-copy-token'),
    
    // Filters
    filterDate: document.getElementById('filter-date'),
    filterSetup: document.getElementById('filter-setup'),
    filterOutcome: document.getElementById('filter-outcome'),
    btnWeeklyReview: document.getElementById('btn-weekly-review'),
    weeklyReviewSection: document.getElementById('weekly-review-section'),
    
    // Stats
    statTotalTrades: document.getElementById('stat-total-trades'),
    statWinRate: document.getElementById('stat-win-rate'),
    statAvgR: document.getElementById('stat-avg-r'),
    statTotalPnl: document.getElementById('stat-total-pnl'),
    
    // Table
    tradesTbody: document.getElementById('trades-tbody'),
    tableLoading: document.getElementById('table-loading'),
    tableEmpty: document.getElementById('table-empty'),
    tableRecordCount: document.getElementById('table-record-count'),
    
    // Toast
    toastContainer: document.getElementById('toast-container'),
    
    // Admin elements
    btnAdminToggle: document.getElementById('btn-admin-toggle'),
    adminPanel: document.getElementById('admin-panel'),
    adminTotalUsers: document.getElementById('admin-total-users'),
    adminTotalSignals: document.getElementById('admin-total-signals'),
    adminWinRate: document.getElementById('admin-win-rate'),
    adminTotalPnl: document.getElementById('admin-total-pnl'),
    adminUsersTbody: document.getElementById('admin-users-tbody'),
    adminTradesTbody: document.getElementById('admin-trades-tbody'),
    adminUserFilter: document.getElementById('admin-user-filter'),
};

// --- Initialization ---
async function init() {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        setupEventListeners();
        
        // Check session
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            handleLogin(session.user);
        }
        
        // Listen for auth changes
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                handleLogin(session.user);
            } else if (event === 'SIGNED_OUT') {
                handleLogout();
            }
        });
    } catch (error) {
        console.error("Supabase init error:", error);
        showToast("Error connecting to database. Check credentials.", "error");
    }
}

function setupEventListeners() {
    // Auth
    els.authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = els.emailInput.value;
        const password = els.passwordInput.value;
        try {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    els.btnSignup.addEventListener('click', async () => {
        if (!els.authForm.checkValidity()) {
            els.authForm.reportValidity();
            return;
        }
        const email = els.emailInput.value;
        const password = els.passwordInput.value;
        try {
            const { error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            showToast("Account created! Check email to verify.", "success");
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    els.btnLogout.addEventListener('click', () => supabaseClient.auth.signOut());
    
    els.btnCopyToken.addEventListener('click', () => {
        if (state.profile?.user_token) {
            navigator.clipboard.writeText(state.profile.user_token)
                .then(() => showToast("Token copied to clipboard!", "success"))
                .catch(() => showToast("Failed to copy token.", "error"));
        }
    });

    // Filters
    els.filterDate.addEventListener('change', (e) => { state.filters.date = e.target.value; loadData(); });
    els.filterSetup.addEventListener('change', (e) => { state.filters.setup = e.target.value; loadData(); });
    els.filterOutcome.addEventListener('change', (e) => { state.filters.outcome = e.target.value; loadData(); });
    
    // Sort
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (state.sort.column === col) {
                state.sort.asc = !state.sort.asc;
            } else {
                state.sort.column = col;
                state.sort.asc = false;
            }
            renderTable(); // Re-render sorted data
        });
    });

    // Weekly Review
    els.btnWeeklyReview.addEventListener('click', () => {
        const isHidden = els.weeklyReviewSection.style.display === 'none';
        els.weeklyReviewSection.style.display = isHidden ? 'block' : 'none';
        if (isHidden) updateWeeklyReview();
    });

    if (els.btnAdminToggle) {
        els.btnAdminToggle.addEventListener('click', () => {
            const isVisible = els.adminPanel.style.display !== 'none';
            els.adminPanel.style.display = isVisible ? 'none' : 'flex';
            els.btnAdminToggle.classList.toggle('active', !isVisible);
            if (!isVisible) loadAdminData();
        });
    }

    if (els.adminUserFilter) {
        els.adminUserFilter.addEventListener('change', () => loadAdminTrades());
    }
}

// --- Auth Handlers ---
async function handleLogin(user) {
    state.user = user;
    els.userEmail.textContent = user.email;
    
    els.authScreen.style.display = 'none';
    els.dashboardScreen.style.display = 'flex';
    
    // Fetch profile for token
    try {
        let { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        if (!profile) {
            // Create default profile if missing (depends on your DB setup)
            const token = generateToken();
            const { data } = await supabaseClient.from('profiles').insert([{ id: user.id, user_token: token }]).select().single();
            profile = data;
        }
        state.profile = profile;
        els.userToken.textContent = profile?.user_token || "No token found";
        
        state.isAdmin = profile?.is_admin === true;
        if (state.isAdmin && els.btnAdminToggle) {
            els.btnAdminToggle.style.display = 'inline-flex';
        }
    } catch (e) {
        console.error("Profile fetch error:", e);
        els.userToken.textContent = "Error loading token";
    }
    
    loadData();
}

function handleLogout() {
    state.user = null;
    state.profile = null;
    state.trades = [];
    state.isAdmin = false;
    if (els.btnAdminToggle) els.btnAdminToggle.style.display = 'none';
    if (els.adminPanel) els.adminPanel.style.display = 'none';
    els.authScreen.style.display = 'flex';
    els.dashboardScreen.style.display = 'none';
}

function generateToken() {
    return 'trk_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// --- Data Fetching ---
async function loadData() {
    els.tableLoading.style.display = 'flex';
    els.tradesTbody.innerHTML = '';
    els.tableEmpty.style.display = 'none';
    
    try {
        let query = supabaseClient.from('trade_signals').select('*').eq('user_id', state.user.id);
        
        // Date Filter
        const now = new Date();
        if (state.filters.date === 'today') {
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            query = query.gte('created_at', startOfDay);
        } else if (state.filters.date === 'week') {
            const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
            query = query.gte('created_at', startOfWeek);
        } else if (state.filters.date === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            query = query.gte('created_at', startOfMonth);
        }
        
        // Outcome Filter
        if (state.filters.outcome !== 'all') {
            query = query.eq('outcome', state.filters.outcome);
        }
        
        // For setup filter, we might need all data to populate the dropdown first
        // So we'll fetch all matching date/outcome, then filter setup client-side
        
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        
        let filteredData = data || [];
        
        // Populate Setup Dropdown if it only has 'all'
        if (els.filterSetup.options.length <= 1) {
            const setups = [...new Set(filteredData.map(t => t.setup_type).filter(Boolean))];
            setups.sort().forEach(setup => {
                const opt = document.createElement('option');
                opt.value = setup;
                opt.textContent = setup;
                els.filterSetup.appendChild(opt);
            });
        }
        
        // Client side setup filter
        if (state.filters.setup !== 'all') {
            filteredData = filteredData.filter(t => t.setup_type === state.filters.setup);
        }
        
        state.trades = filteredData;
        
        updateStats();
        renderTable();
        renderChart();
        if (els.weeklyReviewSection.style.display !== 'none') {
            updateWeeklyReview();
        }
        
    } catch (error) {
        console.error("Data fetch error:", error);
        showToast("Error loading trades.", "error");
    } finally {
        els.tableLoading.style.display = 'none';
    }
}

// --- Updates & Rendering ---
async function updateTradeOutcome(id, newOutcome) {
    try {
        const { error } = await supabaseClient.from('trade_signals').update({ outcome: newOutcome }).eq('id', id);
        if (error) throw error;
        
        // Update local state and re-render
        const trade = state.trades.find(t => t.id === id);
        if (trade) {
            trade.outcome = newOutcome;
            // Note: R-multiple and PnL re-calculation should ideally happen server-side or here if data exists
            updateStats();
            renderChart();
            if (els.weeklyReviewSection.style.display !== 'none') updateWeeklyReview();
        }
        showToast("Trade updated.", "success");
    } catch (error) {
        console.error("Update error:", error);
        showToast("Failed to update trade.", "error");
        // Revert dropdown in UI (simplistic reload for now)
        loadData();
    }
}

function updateStats() {
    const trades = state.trades;
    const total = trades.length;
    
    if (total === 0) {
        els.statTotalTrades.textContent = '0';
        els.statWinRate.textContent = '0%';
        els.statAvgR.textContent = '0.0R';
        els.statTotalPnl.textContent = '$0.00';
        return;
    }
    
    const wins = trades.filter(t => t.outcome === 'WIN').length;
    const winRate = ((wins / total) * 100).toFixed(1);
    
    let totalR = 0;
    let totalPnl = 0;
    
    trades.forEach(t => {
        if (t.r_multiple) totalR += Number(t.r_multiple);
        if (t.pnl_dollars) totalPnl += Number(t.pnl_dollars);
    });
    
    const avgR = total > 0 ? (totalR / total).toFixed(2) : 0;
    
    els.statTotalTrades.textContent = total;
    els.statWinRate.textContent = `${winRate}%`;
    els.statAvgR.textContent = `${avgR}R`;
    
    els.statAvgR.className = 'stat-value mono-text ' + (avgR > 0 ? 'text-win' : (avgR < 0 ? 'text-loss' : ''));
    
    els.statTotalPnl.textContent = formatMoney(totalPnl);
    els.statTotalPnl.className = 'stat-value mono-text ' + (totalPnl > 0 ? 'text-win' : (totalPnl < 0 ? 'text-loss' : ''));
}

function renderTable() {
    const tbody = els.tradesTbody;
    tbody.innerHTML = '';
    
    if (state.trades.length === 0) {
        els.tableEmpty.style.display = 'block';
        els.tableRecordCount.textContent = '0 records';
        return;
    }
    
    els.tableEmpty.style.display = 'none';
    els.tableRecordCount.textContent = `${state.trades.length} records`;
    
    // Sort logic
    const sortedTrades = [...state.trades].sort((a, b) => {
        let valA = a[state.sort.column];
        let valB = b[state.sort.column];
        
        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';
        
        if (typeof valA === 'string') {
            return state.sort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return state.sort.asc ? valA - valB : valB - valA;
        }
    });
    
    sortedTrades.forEach(trade => {
        const tr = document.createElement('tr');
        
        const rMult = trade.r_multiple ? Number(trade.r_multiple).toFixed(2) : '-';
        const rClass = trade.r_multiple > 0 ? 'text-win' : (trade.r_multiple < 0 ? 'text-loss' : '');
        
        let pnlStr = trade.pnl_dollars ? formatMoney(trade.pnl_dollars) : '-';
        
        tr.innerHTML = `
            <td>${formatDate(trade.created_at)}</td>
            <td class="mono-text font-medium">${trade.ticker || '-'}</td>
            <td>${getDirectionBadge(trade.direction)}</td>
            <td>${getGradeBadge(trade.grade)}</td>
            <td>${trade.setup_type || '-'}</td>
            <td class="mono-text">${trade.entry_price ? trade.entry_price : '-'}</td>
            <td class="mono-text">${trade.sl_price ? trade.sl_price : '-'}</td>
            <td class="mono-text">${trade.score ? trade.score + '/10' : '-'}</td>
            <td>
                <select class="outcome-select" data-id="${trade.id}">
                    <option value="" ${!trade.outcome ? 'selected' : ''}>Pending</option>
                    <option value="WIN" ${trade.outcome === 'WIN' ? 'selected' : ''}>Win</option>
                    <option value="LOSS" ${trade.outcome === 'LOSS' ? 'selected' : ''}>Loss</option>
                    <option value="BE" ${trade.outcome === 'BE' ? 'selected' : ''}>Break Even</option>
                    <option value="SKIPPED" ${trade.outcome === 'SKIPPED' ? 'selected' : ''}>Skipped</option>
                </select>
            </td>
            <td class="mono-text ${rClass}">${rMult}${rMult !== '-' ? 'R' : ''}</td>
            <td class="mono-text text-right ${trade.pnl_dollars > 0 ? 'text-win' : (trade.pnl_dollars < 0 ? 'text-loss' : '')}">${pnlStr}</td>
        `;
        
        tbody.appendChild(tr);
    });
    
    // Add event listeners to dropdowns
    document.querySelectorAll('.outcome-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            const val = e.target.value;
            updateTradeOutcome(id, val);
        });
    });
}

function renderChart() {
    const ctx = document.getElementById('pnl-chart').getContext('2d');
    
    if (state.chartInstance) {
        state.chartInstance.destroy();
    }
    
    // Sort trades chronologically for chart
    const chronologicalTrades = [...state.trades].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    const labels = [];
    const dataR = [];
    let cumulativeR = 0;
    
    chronologicalTrades.forEach(t => {
        if (t.outcome && t.outcome !== 'PENDING' && t.outcome !== 'SKIPPED') {
            labels.push(formatDateShort(t.created_at));
            cumulativeR += (Number(t.r_multiple) || 0);
            dataR.push(cumulativeR.toFixed(2));
        }
    });
    
    // Add initial zero point
    if (labels.length > 0) {
        labels.unshift('');
        dataR.unshift(0);
    }
    
    const isPositive = cumulativeR >= 0;
    const lineColor = isPositive ? '#10b981' : '#ef4444';
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, isPositive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)');
    gradient.addColorStop(1, 'rgba(18, 18, 26, 0)');

    state.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative R',
                data: dataR,
                borderColor: lineColor,
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(18, 18, 26, 0.9)',
                    titleColor: '#9ca3af',
                    bodyColor: '#f3f4f6',
                    borderColor: '#2a2a3e',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(42, 42, 62, 0.3)', drawBorder: false },
                    ticks: { color: '#9ca3af', maxTicksLimit: 10 }
                },
                y: {
                    grid: { color: 'rgba(42, 42, 62, 0.5)', drawBorder: false },
                    ticks: { color: '#9ca3af' }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
}

function updateWeeklyReview() {
    const trades = state.trades.filter(t => t.setup_type && t.outcome && (t.outcome === 'WIN' || t.outcome === 'LOSS'));
    
    const setupStats = {};
    
    trades.forEach(t => {
        const type = t.setup_type;
        if (!setupStats[type]) {
            setupStats[type] = { wins: 0, losses: 0, r: 0 };
        }
        if (t.outcome === 'WIN') setupStats[type].wins++;
        if (t.outcome === 'LOSS') setupStats[type].losses++;
        setupStats[type].r += (Number(t.r_multiple) || 0);
    });
    
    const statsArray = Object.keys(setupStats).map(key => ({
        setup: key,
        ...setupStats[key],
        total: setupStats[key].wins + setupStats[key].losses,
        winRate: setupStats[key].wins / (setupStats[key].wins + setupStats[key].losses)
    }));
    
    const topList = document.getElementById('top-setups-list');
    const bottomList = document.getElementById('bottom-setups-list');
    const recommendation = document.getElementById('review-recommendation');
    
    topList.innerHTML = '';
    bottomList.innerHTML = '';
    
    if (statsArray.length === 0) {
        topList.innerHTML = '<li>Not enough data</li>';
        bottomList.innerHTML = '<li>Not enough data</li>';
        recommendation.textContent = 'Need more trade outcomes to provide recommendations.';
        return;
    }
    
    // Sort by R generated
    statsArray.sort((a, b) => b.r - a.r);
    
    const top3 = statsArray.slice(0, 3).filter(s => s.r > 0);
    const bottom3 = [...statsArray].sort((a, b) => a.r - b.r).slice(0, 3).filter(s => s.r < 0);
    
    top3.forEach(s => {
        topList.innerHTML += `<li><span>${s.setup}</span> <span class="text-win">+${s.r.toFixed(2)}R</span></li>`;
    });
    
    bottom3.forEach(s => {
        bottomList.innerHTML += `<li><span>${s.setup}</span> <span class="text-loss">${s.r.toFixed(2)}R</span></li>`;
    });
    
    if (top3.length === 0) topList.innerHTML = '<li class="text-muted">No profitable setups yet</li>';
    if (bottom3.length === 0) bottomList.innerHTML = '<li class="text-muted">No unprofitable setups</li>';
    
    if (bottom3.length > 0) {
        recommendation.textContent = `Consider reducing size or cutting out "${bottom3[0].setup}" setups. They are dragging down your expectancy.`;
    } else if (top3.length > 0) {
        recommendation.textContent = `Great job! Double down on "${top3[0].setup}" setups.`;
    }
}

// --- Admin Functions ---
async function loadAdminData() {
    if (!state.isAdmin) return;
    
    try {
        // Fetch all profiles (admin RLS allows this)
        const { data: users, error: usersError } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (usersError) throw usersError;
        
        // Fetch all trades
        const { data: allTrades, error: tradesError } = await supabase
            .from('trade_signals')
            .select('*, profiles!inner(email)')
            .order('created_at', { ascending: false });
        
        if (tradesError) throw tradesError;
        
        state.adminUsers = users || [];
        state.adminTrades = allTrades || [];
        
        renderAdminStats(users, allTrades);
        renderAdminUsers(users, allTrades);
        renderAdminTrades(allTrades);
        populateAdminUserFilter(users);
    } catch (error) {
        console.error('Admin data error:', error);
        showToast('Error loading admin data.', 'error');
    }
}

function renderAdminStats(users, trades) {
    els.adminTotalUsers.textContent = users.length;
    els.adminTotalSignals.textContent = trades.length;
    
    const withOutcome = trades.filter(t => t.outcome === 'WIN' || t.outcome === 'LOSS');
    const wins = withOutcome.filter(t => t.outcome === 'WIN').length;
    const winRate = withOutcome.length > 0 ? ((wins / withOutcome.length) * 100).toFixed(1) : '0';
    els.adminWinRate.textContent = winRate + '%';
    
    const totalPnl = trades.reduce((sum, t) => sum + (Number(t.pnl_dollars) || 0), 0);
    els.adminTotalPnl.textContent = formatMoney(totalPnl);
    els.adminTotalPnl.className = 'stat-value mono-text ' + (totalPnl > 0 ? 'text-win' : totalPnl < 0 ? 'text-loss' : '');
}

function renderAdminUsers(users, allTrades) {
    const tbody = els.adminUsersTbody;
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const userTrades = allTrades.filter(t => t.user_id === user.id);
        const withOutcome = userTrades.filter(t => t.outcome === 'WIN' || t.outcome === 'LOSS');
        const wins = withOutcome.filter(t => t.outcome === 'WIN').length;
        const winRate = withOutcome.length > 0 ? ((wins / withOutcome.length) * 100).toFixed(1) + '%' : '-';
        const avgR = userTrades.length > 0 ? (userTrades.reduce((s, t) => s + (Number(t.r_multiple) || 0), 0) / userTrades.length).toFixed(2) : '-';
        const totalPnl = userTrades.reduce((s, t) => s + (Number(t.pnl_dollars) || 0), 0);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${user.email || '-'}</td>
            <td>${user.display_name || '-'}</td>
            <td>${formatDate(user.created_at)}</td>
            <td class="mono-text">${userTrades.length}</td>
            <td class="mono-text">${winRate}</td>
            <td class="mono-text ${avgR > 0 ? 'text-win' : avgR < 0 ? 'text-loss' : ''}">${avgR !== '-' ? avgR + 'R' : '-'}</td>
            <td class="mono-text ${totalPnl > 0 ? 'text-win' : totalPnl < 0 ? 'text-loss' : ''}">${formatMoney(totalPnl)}</td>
            <td>${user.is_admin ? '<span class="badge badge-loss">Admin</span>' : '<span class="badge badge-be">User</span>'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAdminTrades(trades) {
    const tbody = els.adminTradesTbody;
    tbody.innerHTML = '';
    
    const filterUser = els.adminUserFilter?.value || 'all';
    const filtered = filterUser === 'all' ? trades : trades.filter(t => t.user_id === filterUser);
    
    filtered.slice(0, 100).forEach(trade => {
        const rMult = trade.r_multiple ? Number(trade.r_multiple).toFixed(2) : '-';
        const rClass = trade.r_multiple > 0 ? 'text-win' : (trade.r_multiple < 0 ? 'text-loss' : '');
        const userEmail = trade.profiles?.email || 'Unknown';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${userEmail}</td>
            <td>${formatDate(trade.created_at)}</td>
            <td>${getDirectionBadge(trade.direction)}</td>
            <td>${getGradeBadge(trade.grade)}</td>
            <td>${trade.setup_type || '-'}</td>
            <td class="mono-text">${trade.entry_price || '-'}</td>
            <td class="mono-text">${trade.sl_price || '-'}</td>
            <td>${trade.outcome ? getOutcomeBadge(trade.outcome) : '<span class="text-muted">Pending</span>'}</td>
            <td class="mono-text ${rClass}">${rMult !== '-' ? rMult + 'R' : '-'}</td>
            <td class="mono-text text-right ${trade.pnl_dollars > 0 ? 'text-win' : trade.pnl_dollars < 0 ? 'text-loss' : ''}">${trade.pnl_dollars ? formatMoney(trade.pnl_dollars) : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function loadAdminTrades() {
    if (state.adminTrades) {
        renderAdminTrades(state.adminTrades);
    }
}

function populateAdminUserFilter(users) {
    const select = els.adminUserFilter;
    if (!select) return;
    // Clear existing options except 'All Users'
    while (select.options.length > 1) select.remove(1);
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.email || u.id;
        select.appendChild(opt);
    });
}

function getOutcomeBadge(outcome) {
    if (!outcome) return '-';
    const map = { 'WIN': 'badge-win', 'LOSS': 'badge-loss', 'BREAKEVEN': 'badge-be', 'BE': 'badge-be', 'SKIPPED': 'badge-be' };
    return `<span class="badge ${map[outcome] || 'badge-be'}">${outcome}</span>`;
}

// --- Helpers ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    els.toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatDate(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.getMonth()+1}/${d.getDate()}`;
}

function formatMoney(num) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function getDirectionBadge(dir) {
    if (!dir) return '-';
    dir = dir.toUpperCase();
    if (dir === 'LONG') return '<span class="badge badge-win">LONG</span>';
    if (dir === 'SHORT') return '<span class="badge badge-loss">SHORT</span>';
    return `<span class="badge badge-be">${dir}</span>`;
}

function getGradeBadge(grade) {
    if (!grade) return '-';
    grade = grade.toUpperCase();
    if (grade === 'A' || grade === 'A+') return '<span class="badge badge-win">' + grade + '</span>';
    if (grade === 'B') return '<span class="badge badge-warn">' + grade + '</span>';
    if (grade === 'C' || grade === 'F') return '<span class="badge badge-loss">' + grade + '</span>';
    return `<span class="badge badge-be">${grade}</span>`;
}

// Start
document.addEventListener('DOMContentLoaded', init);
