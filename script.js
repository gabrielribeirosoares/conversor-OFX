const SUPABASE_URL = 'https://ewawtckqvicvfuwrasel.supabase.co';
const SUPABASE_KEY = 'sb_publishable_02GmlN7B5mkkavp8mrjoIg_3Hdhnkud';

// Usamos um nome único para evitar o erro "already declared"
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Referências da Interface
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authTitle = document.getElementById('auth-title');
const authError = document.getElementById('auth-error');

// --- Tradutor de Erros ---
function traduzirErro(mensagemOriginal) {
  if (!mensagemOriginal) return 'Erro desconhecido no servidor.';
  const msg = String(mensagemOriginal).toLowerCase();

  if (msg.includes('password should contain')) return 'A senha deve conter letras e números.';
  if (msg.includes('at least 6 characters')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (msg.includes('already registered')) return 'Este e-mail já está registado.';
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde um momento.';

  return 'Verifique os dados e tente novamente.';
}

// --- Navegação entre Telas ---
document.getElementById('go-to-register').onclick = () => {
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
  authTitle.textContent = 'Criar Nova Conta';
  authError.textContent = '';
};

document.getElementById('go-to-login').onclick = () => {
  registerForm.style.display = 'none';
  loginForm.style.display = 'block';
  authTitle.textContent = 'Entrar no Sistema';
  authError.textContent = '';
};

function permitirEntrada() {
  authScreen.style.display = 'none';
  appScreen.style.display = 'block';
}

function bloquearSaida() {
  authScreen.style.display = 'flex';
  appScreen.style.display = 'none';
}

// ============================================================================
// 2. LÓGICA DE REGISTO (NOME, APELIDO E ESCRITÓRIO)
// ============================================================================
// --- Botão de Registo (Com Validação de Campos) ---
document.getElementById('btn-do-register').onclick = async () => {
  try {
    // Captura os valores e limpa espaços extras
    const firstName = document.getElementById('reg-first-name').value.trim();
    const lastName = document.getElementById('reg-last-name').value.trim();
    const office = document.getElementById('reg-office').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    // 1. VALIDAÇÃO: Verifica se algum campo está vazio
    if (!firstName || !lastName || !office || !email || !password) {
      authError.style.color = 'var(--accent2)'; // Cor de erro (vermelho)
      authError.textContent = 'Preencha todos os campos (Nome, Apelido, Escritório, E-mail e Senha).';

      // Dá um destaque visual no campo vazio (opcional)
      if (!firstName) document.getElementById('reg-first-name').focus();
      else if (!lastName) document.getElementById('reg-last-name').focus();
      else if (!office) document.getElementById('reg-office').focus();

      return; // PARA A EXECUÇÃO AQUI. Não envia nada para o Supabase.
    }

    // 2. VALIDAÇÃO EXTRA: Tamanho mínimo da senha
    if (password.length < 6) {
      authError.style.color = 'var(--accent2)';
      authError.textContent = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }

    // Se passou pelas validações, limpa erros antigos e prossegue
    authError.style.color = 'var(--text)';
    authError.textContent = 'Criando conta...';

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          office: office
        }
      }
    });

    if (error) {
      console.warn("Recusa (Supabase):", error);
      authError.style.color = 'var(--accent2)';
      authError.textContent = traduzirErro(error.message);
    } else {
      authError.style.color = 'var(--accent)';
      authError.textContent = 'Conta criada com sucesso! Já pode fazer login.';
      // Limpa os campos após o sucesso
      registerForm.querySelectorAll('input').forEach(input => input.value = '');
      setTimeout(() => document.getElementById('go-to-login').click(), 2500);
    }
  } catch (err) {
    console.error("Erro fatal:", err);
    authError.style.color = 'var(--accent2)';
    authError.textContent = 'Erro no sistema. Tente novamente.';
  }
};

// ============================================================================
// 3. LÓGICA DE LOGIN
// ============================================================================
document.getElementById('btn-do-login').onclick = async () => {
  try {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!email || !password) {
      authError.textContent = 'E-mail e senha são obrigatórios.';
      return;
    }

    authError.textContent = 'Acessando...';

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      authError.textContent = traduzirErro(error.message);
    } else {
      authError.textContent = '';
      // Antes de liberar a tela, verificamos o pagamento
      const temAcesso = await verificarAcessoEPlano();
      permitirEntrada();
    }
  } catch (err) {
    console.error("Erro no login:", err);
    authError.textContent = 'Erro ao aceder ao servidor.';
  }
};

// Logout e Sessão
document.getElementById('btn-logout').onclick = async () => {
  await supabaseClient.auth.signOut();
  bloquearSaida();
};

// ==========================================
// MONITOR DE SEGURANÇA (LOGOFF INSTANTÂNEO)
// ==========================================

async function validarUsuarioNoServidor() {
  // getUser() obriga o Supabase a checar o banco de dados real
  const { data: { user }, error } = await supabaseClient.auth.getUser();

  // Se o servidor retornar erro ou não encontrar o user, o usuário foi deletado/banido
  if (error || !user) {
    console.warn("Acesso revogado pelo administrador.");
    await supabaseClient.auth.signOut();
    bloquearSaida();
    authError.style.color = 'var(--accent2)';
    authError.textContent = "Sua conta foi desativada ou excluída.";
    return false;
  }
  return true;
}

// Verifica a cada 10 segundos se o usuário ainda existe no banco
// (Você pode aumentar esse tempo para 30 ou 60 segundos para economizar recursos)
let monitorAcesso = null;

function iniciarMonitoramento() {
  if (monitorAcesso) clearInterval(monitorAcesso);

  monitorAcesso = setInterval(async () => {
    const ativo = await validarUsuarioNoServidor();
    if (!ativo) clearInterval(monitorAcesso);
  }, 60000); // 10000ms = 10 segundos
}

async function verificarSessaoInicial() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    const aindaExiste = await validarUsuarioNoServidor();
    if (aindaExiste) {
      permitirEntrada();
      iniciarMonitoramento(); // Começa a vigiar o status
    }
  } else {
    bloquearSaida();
  }
}

// Atualiza o monitoramento quando o estado muda
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    iniciarMonitoramento();
    permitirEntrada();
  }
  if (event === 'SIGNED_OUT') {
    clearInterval(monitorAcesso);
    bloquearSaida();
  }
});

// Inicia a checagem assim que a página abre
verificarSessaoInicial();

// ============================================================================
// 4. MOTOR DO CONVERSOR (REGRAS DOS BANCOS)
// ============================================================================
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const BANCOS = {
  "Unicred": { bank_id: "136", type: "UNICRED" },
  "Sicredi": {
    bank_id: "748", type: "STANDARD", date_format: "FULL",
    regex: /^\s*(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})/,
    mapping: { date: 1, desc: 2, amount: 3 }
  },
  "Banco do Brasil": {
    bank_id: "001", type: "SPLIT_DATE",
    regex_date: /^\s*(\d{2}\/\d{2}\/\d{4})\s*(.*)$/,
    regex_amount: /^(.*?)\s+([\d\.,]+\s*\([\+\-]\))$/
  },
  "Banrisul": {
    bank_id: "041", type: "STANDARD", date_format: "INHERIT",
    regex: /^\s*(?:(\d{2}\/\d{2}\/\d{4})\s+)?(.*?)\s+(\d+(?:\.\d{3})*,\d{2}\s*[-–—]?)(?:\s.*)?$/,
    mapping: { date: 1, desc: 2, amount: 3 }
  },
  "Sicoob": {
    bank_id: "756", type: "STANDARD", date_format: "AUTO",
    // Aceita datas completas ou curtas e considera C/D como positivo e negativo (ignorando asteriscos)
    regex: /^\s*(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+([-]?\s*[\d\.,]+\s*[CDcd]?)\s*(?:\*+)?\s*$/i,
    mapping: { date: 1, desc: 2, amount: 3 }
  },

  "Stone": {
    bank_id: "197", type: "STANDARD", date_format: "DD_MM_YY",
    regex: /(?:^|\s)(\d{2}\/\d{2}\/\d{2})\s+(?:Entrada|Sa[íi]da)\s*(.*?)\s*([-–—]?\s*R\$\s*[\d\.,]+)/i,
    mapping: { date: 1, desc: 2, amount: 3 }
  },
  "Mercado Pago": {
    bank_id: "323", type: "STANDARD", date_format: "DD-MM-YYYY",
    regex: /^\s*(\d{2}-\d{2}-\d{4})\s*(.*?)\s+([-–—]?\s*R\$\s*[-–—]?\s*[\d\.,]+)/,
    mapping: { date: 1, desc: 2, amount: 3 }
  }
};

let selectedBank = null;
let selectedFile = null;
let lastTransactions = [];
let lastPdfText = '';

// ─── Bank grid ───
const bankGrid = document.getElementById('bank-grid');
Object.entries(BANCOS).forEach(([name, cfg]) => {
  const btn = document.createElement('button');
  btn.className = 'bank-btn';
  btn.innerHTML = `${name}<span class="bank-id">${cfg.bank_id}</span>`;
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bank-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedBank = name;
    updateConvertBtn();
  });
  bankGrid.appendChild(btn);
});

// ─── File input ───
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const fileClear = document.getElementById('file-clear');

function setFile(file) {
  if (!file || file.type !== 'application/pdf') { alert('Por favor, selecione um arquivo PDF.'); return; }
  selectedFile = file;
  fileName.textContent = file.name;
  fileInfo.classList.add('visible');
  lastPdfText = '';
  updateConvertBtn();
}

fileInput.addEventListener('change', e => setFile(e.target.files[0]));
fileClear.addEventListener('click', e => {
  e.stopPropagation();
  selectedFile = null;
  fileInput.value = '';
  fileInfo.classList.remove('visible');
  updateConvertBtn();
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  setFile(e.dataTransfer.files[0]);
});

function updateConvertBtn() {
  document.getElementById('btn-convert').disabled = !(selectedBank && selectedFile);
}

// ─── PDF extraction ───
async function extractTextFromPDF(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    const lines = [];
    let lastY = null;
    let line = '';
    const sorted = [...content.items].sort((a, b) => {
      const dy = Math.round(b.transform[5]) - Math.round(a.transform[5]);
      return dy !== 0 ? dy : a.transform[4] - b.transform[4];
    });
    for (const item of sorted) {
      const y = Math.round(item.transform[5]);
      if (lastY === null || Math.abs(y - lastY) > 3) {
        if (line) lines.push(line);
        line = item.str;
        lastY = y;
      } else {
        const gap = item.transform[4] - (sorted[sorted.indexOf(item) - 1]?.transform[4] + sorted[sorted.indexOf(item) - 1]?.width || 0);
        line += (gap > 5 ? '  ' : ' ') + item.str;
      }
    }
    if (line) lines.push(line);
    fullText += lines.join('\n') + '\n';
    if (onProgress) onProgress(i / pdf.numPages);
  }
  return fullText;
}

// ─── Parsers ───
function cleanCurrency(str) {
  if (!str) return null;
  const isNeg = /[-–—]/.test(str) || /[Dd]/.test(str.replace(/R\$/, ''));
  let clean = str.replace(/[R$\s\-–—CDcd()+]/g, '').replace(/\./g, '').replace(',', '.');
  const val = parseFloat(clean);
  if (isNaN(val)) return null;
  return isNeg ? -val : val;
}

function parseDate(str, fmt) {
  const [d, m, y] = str.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateOFX(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function formatDateDisplay(dt) {
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

async function md5hash(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// ─── Main processor ───
async function processText(text, bankConfig) {
  const transactions = [];
  const lines = text.split('\n');
  const layout = bankConfig.type;
  const mesesMap = { JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06", JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12" };

  let currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  let currentYear = String(new Date().getFullYear());
  let lastDay = null;
  let currentTx = null;
  let nextMemoBuffer = '';

  const IGNORAR = [
    "SALDO", "TOTAL", "HISTÓRICO", "HISTORICO", "DATA", "PÁGINA", "PAGINA", "SICOOB", "OUVIDORIA",
    "LOTE", "DOCUMENTO", "PERÍODO", "PERIODO", "NOME", "INSTITUIÇÃO", "DADOS DA CONTA",
    "CONTRAPARTE", "TIPO", "DESCRIÇÃO", "DESCRICAO", "VALOR", "EXTRATO", "EMITIDO",
    "STONE", "AGÊNCIA", "AGENCIA", "CONTA", "DETALHE DOS", "ID DA",
    "DDAATTAA", "ENTRADAS", "SAIDAS", "SAÍDAS", "CPF", "CNPJ",
    "BANCO DO ESTADO", "BVP-PORTAL", "SALDOS E MOVIMENTOS", "DADOS SELECIONADOS",
    "CLASSIFICAÇÃO", "CLASSIFICACAO", "EXTRA-CONTÁBIL", "EXTRA-CONTABIL",
    "LIMITE", "---", "PARA SIMPLES", "INVEST RESGATE", "INVESTIMENTOS",
    "ENCARGOS FINANCEIROS", "TAXA DE JUROS", "CUSTO EFETIVO",
    "PARA GARANTIR", "PREZADO CLIENTE", "ULTIMO DIA", "BANRICOMPRAS",
    "UTILIZADO", "DISPONIVEL", "VALORES DISPONIVEIS", "CDB AUTOMATICO", "POSICAO EM",
    "++", "OPERACAO", "O LIMITE", "QUANTIDADE", "BENEFICIOS", "TEB", "O SALDO DEVEDOR",
    "AG:", "CC:", "PAGAMENTO S.A", "INFORMAÇÕES DO COMPROVANTE", "CÓDIGO DA AUTENTICAÇÃO",
    "INFORMACÕES", "CODIGO DA AUTENTICACAO", "SE NOSSO ATENDIMENTO", "DÚVIDAS", "DUVIDAS",
    "REGIÕES", "REGIOES", "ENVIE UM", "OUTRAS", "3004-", "0800",
    "ID. DOC", "ID.DOC", "ID DOC", "ID.", "COOPERATIVA 515", "UNICRED", "SISTEMA DE COOPERATIVAS"
  ];

  function removerLoteDoc(texto) {
    const partes = texto.trim().split(/\s+/);
    while (partes.length && /^\d+$/.test(partes[0])) partes.shift();
    return partes.join(' ');
  }

  async function saveTx() {
    if (!currentTx || currentTx.amount === null || currentTx.amount === undefined) return;
    let memo = currentTx.memo.replace(/\(cid:\d+\)/g, ' ').replace(/\s+/g, ' ').trim();

    const upper = memo.toUpperCase();
    if (["SALDO ANTERIOR", "SALDO DO DIA", "SALDO INICIAL", "SALDO NA DATA", "SALDO CALC"].some(s => upper.includes(s))) return;

    for (const p of ["PIX ", "Pix - Enviado", "Pix - Recebido", "Pix | ", "Pix "]) {
      if (memo.startsWith(p)) { memo = memo.slice(p.length).trim(); break; }
    }
    if (!memo) memo = "Transação Sem Descrição";

    const fitid = await md5hash(`${currentTx.date.toISOString()}${currentTx.amount}${memo}`);
    transactions.push({ date: currentTx.date, amount: currentTx.amount, memo, fitid });
  }

  for (const rawLine of lines) {
    const linha = rawLine.trim();
    if (!linha) continue;

    const mAno = linha.match(/PER[IÍ]ODO.*?(20\d{2})/i);
    if (mAno) currentYear = mAno[1];

    if (layout === "STANDARD" && (bankConfig.date_format === "INHERIT" || bankConfig.date_format === "DIA_APENAS")) {
      const mRef = linha.match(/(?:Data Ref\.:|até\s+)\d{2}\/(\d{2})\/(\d{4})/i);
      if (mRef) { currentMonth = mRef[1]; currentYear = mRef[2]; }
      else {
        const mMov = linha.match(/MOVIMENTOS\s+([A-Z]{3})\/(\d{4})/i);
        if (mMov) { currentMonth = mesesMap[mMov[1].toUpperCase()] || currentMonth; currentYear = mMov[2]; }
      }
    }

    const upper = linha.toUpperCase();
    let skip = IGNORAR.some(p => upper.startsWith(p));
    if (!skip && (/I=PDF|U=NC|G=30/.test(upper))) skip = true;
    if (!skip && /^[\+\-\s]+$/.test(linha)) skip = true;
    if (!skip && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(linha.toLowerCase())) skip = true;
    if (!skip && /^\s*\d{2}[-\/]\d{2}[-\/]\d{2,4}\s+(?:a|até|al|-)\s+\d{2}[-\/]\d{2}[-\/]\d{2,4}/i.test(linha)) skip = true;
    if (skip) continue;

    if (layout === "UNICRED") {
      const mDate = linha.match(/^\s*(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
      if (mDate) {
        const dateStr = mDate[1];
        let resto = mDate[2];
        const m2 = resto.match(/(.*?)\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})$/);
        const m1 = resto.match(/(.*?)\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})$/);
        let valStr = null, desc = resto.trim();
        if (m2 && m2[1].trim()) { desc = m2[1].trim(); valStr = m2[2]; }
        else if (m1 && m1[1].trim()) { desc = m1[1].trim(); valStr = m1[2]; }
        desc = desc.replace(/^\d{5,}\s+/, '').replace(/^(?:CRED PIX|DEB PIX|DomDeb|TEV|DOC|TED|PIX|TAR|TRF|DEP)\s+/i, '').replace(/\s+/g, ' ').trim();
        if (nextMemoBuffer) { desc = `${nextMemoBuffer.trim()} ${desc}`.trim(); nextMemoBuffer = ''; }
        await saveTx();
        const dt = parseDate(dateStr, 'DD/MM/YYYY');
        currentTx = { date: dt, amount: valStr ? cleanCurrency(valStr) : null, memo: desc };
      } else {
        if (currentTx !== null) {
          if (currentTx.amount === null) {
            const m2l = linha.match(/^\s*([-]?\d{1,3}(?:\.\d{3})*,\d{2})\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})/);
            const m1l = linha.match(/^\s*([-]?\d{1,3}(?:\.\d{3})*,\d{2})/);
            if (m2l) {
              currentTx.amount = cleanCurrency(m2l[1]);
              const rest = linha.slice(m2l[0].length).trim();
              if (rest) currentTx.memo += ' ' + rest;
            } else if (m1l) {
              currentTx.amount = cleanCurrency(m1l[1]);
              const rest = linha.slice(m1l[0].length).trim();
              if (rest) currentTx.memo += ' ' + rest;
            } else { currentTx.memo += ' ' + linha; }
          } else { currentTx.memo += ' ' + linha; }
        } else { nextMemoBuffer += ' ' + linha; }
      }
    }
    else if (layout === "SPLIT_DATE") {
      const mDate = linha.match(bankConfig.regex_date);
      if (mDate) {
        const dateStr = mDate[1];
        if (dateStr === "00/00/0000") continue;
        await saveTx();
        let memoStart = removerLoteDoc(mDate[2].trim());
        if (nextMemoBuffer) { memoStart = `${nextMemoBuffer.trim()} ${memoStart}`.trim(); nextMemoBuffer = ''; }
        currentTx = { date: parseDate(dateStr, 'DD/MM/YYYY'), memo: memoStart, amount: null };
        continue;
      }
      if (currentTx !== null) {
        if (currentTx.amount === null) {
          const mAmt = linha.match(bankConfig.regex_amount);
          if (mAmt) {
            const antes = removerLoteDoc(mAmt[1].trim());
            if (antes) currentTx.memo += ' ' + antes;
            const amt = cleanCurrency(mAmt[2]);
            if (amt !== null) currentTx.amount = amt;
            continue;
          }
        }
        const extra = removerLoteDoc(linha);
        if (extra) currentTx.memo += ' ' + extra;
      }
    }
    else if (layout === "STANDARD") {
      const match = linha.match(bankConfig.regex);
      if (match) {
        await saveTx();
        currentTx = null;
        const g = match;
        const mi = bankConfig.mapping;
        let dateStr = g[mi.date];
        let descRaw = g[mi.desc] || '';
        const valueStr = g[mi.amount];

        if (bankConfig.bank_id === "323") descRaw = descRaw.replace(/\s*\d{8,}\s*$/, '');
        else if (bankConfig.bank_id === "041") descRaw = descRaw.trim().replace(/\s+\d{4,}\s*$/, '');

        const fmt = bankConfig.date_format;
        if (fmt === "DIA_MES") {
          dateStr = `${dateStr}/${currentYear}`;
        } else if (fmt === "DIA_APENAS") {
          if (dateStr) lastDay = dateStr; else { if (!lastDay) continue; dateStr = lastDay; }
          dateStr = `${dateStr}/${currentMonth}/${currentYear}`;
        } else if (fmt === "DD_MM_YY") {
          const p = dateStr.split('/');
          if (p.length === 3 && p[2].length === 2) dateStr = `${p[0]}/${p[1]}/20${p[2]}`;
        } else if (fmt === "DD-MM-YYYY") {
          dateStr = dateStr.replace(/-/g, '/');
        } else if (fmt === "INHERIT") {
          if (dateStr) lastDay = dateStr; else { if (!lastDay) continue; dateStr = lastDay; }
        }

        const dt = parseDate(dateStr, 'DD/MM/YYYY');
        const amt = cleanCurrency(valueStr);
        if (amt === null) continue;
        let memoStart = removerLoteDoc(descRaw.trim());
        if (nextMemoBuffer) { memoStart = `${nextMemoBuffer.trim()} ${memoStart}`.trim(); nextMemoBuffer = ''; }
        currentTx = { date: dt, amount: amt, memo: memoStart };
      } else {
        const extra = removerLoteDoc(linha);
        if (extra) {
          if (currentTx) {
            if (bankConfig.bank_id === "197") {
              const lixo = ["STONE", "AG:", "CC:", "PAGAMENTO S.A", "INSTITUIÇ", "CONTRAPARTE"];
              const trailing = ["PIX", "ANTECIPA", "TRANSFER", "MAQUININHA", "CARTÃO", "CARTAO", "CRÉDITO", "CREDITO", "DÉBITO", "DEBITO"];
              if (lixo.some(c => extra.toUpperCase().includes(c))) { /* skip */ }
              else if (trailing.some(t => extra.toUpperCase().includes(t))) currentTx.memo += ' ' + extra;
              else nextMemoBuffer += ' ' + extra;
            } else if (bankConfig.bank_id === "323") {
              const mpH = ["PAGAMENTO COM", "TRANSFERÊNCIA", "TRANSFERENCIA", "PIX ENVIADO", "PIX RECEBIDO", "LIBERAÇÃO", "LIBERACAO", "RENDIMENTO", "PAGAMENTO DE", "COMPRA ", "RECARGA ", "TARIFA", "ESTORNO", "DEVOLUÇÃO", "DEVOLUCAO"];
              if (mpH.some(p => extra.toUpperCase().startsWith(p)) && !/\d/.test(extra)) nextMemoBuffer += ' ' + extra;
              else currentTx.memo += ' ' + extra;
            } else { currentTx.memo += ' ' + extra; }
          } else {
            if (bankConfig.bank_id === "197" && ["STONE", "AG:", "CC:", "PAGAMENTO S.A", "INSTITUIÇ", "CONTRAPARTE"].some(c => extra.toUpperCase().includes(c))) { /* skip */ }
            else nextMemoBuffer += ' ' + extra;
          }
        }
      }
    }
  }

  if (nextMemoBuffer && currentTx) currentTx.memo += ' ' + nextMemoBuffer.trim();
  await saveTx();
  return transactions;
}

// ─── OFX generator ───
function generateOFX(transactions, bankId) {
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  const header = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n<OFX>\n<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>\n<DTSERVER>${ts}</DTSERVER><LANGUAGE>POR</LANGUAGE></SONRS></SIGNONMSGSRSV1>\n<BANKMSGSRSV1><STMTTRNRS><TRNUID>1001</TRNUID>\n<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>\n<STMTRS><CURDEF>BRL</CURDEF>\n<BANKACCTFROM><BANKID>${bankId}</BANKID><ACCTID>00000</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>\n<BANKTRANLIST><DTSTART>${ts}</DTSTART><DTEND>${ts}</DTEND>\n`;

  let body = '';
  for (const tx of transactions) {
    const dtFmt = formatDateOFX(tx.date);
    const trntype = tx.amount > 0 ? 'CREDIT' : 'DEBIT';
    const safeMemo = tx.memo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    body += `<STMTTRN><TRNTYPE>${trntype}</TRNTYPE><DTPOSTED>${dtFmt}</DTPOSTED><TRNAMT>${tx.amount.toFixed(2)}</TRNAMT><FITID>${tx.fitid}</FITID><MEMO>${safeMemo}</MEMO></STMTTRN>\n`;
  }

  const footer = `</BANKTRANLIST><LEDGERBAL><BALAMT>0.00</BALAMT><DTASOF>${ts}</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  return header + body + footer;
}

function downloadOFX(content, filename) {
  const blob = new Blob([content], { type: 'application/x-ofx' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.style.display = 'none';
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click(); // Dispara o download

  // Limpeza para evitar vazamento de memória e refresh
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

function setProgress(pct, label) {
  document.getElementById('progress-fill').style.width = (pct * 100) + '%';
  document.getElementById('progress-label').textContent = label;
}

function showResult(type, icon, title, bodyHTML) {
  const card = document.getElementById('result-card');
  card.className = `result-card visible ${type}`;
  document.getElementById('result-icon').textContent = icon;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-body').innerHTML = bodyHTML;
}

document.getElementById('btn-convert').addEventListener('click', async () => {

  // TRAVA 1: Verifica o acesso antes de qualquer outra ação
  const acessoPermitido = await verificarAcessoEPlano();
  if (!acessoPermitido) {
    // Se a função retornar false, ela já ativou o banner e mudou o texto do botão.
    // Paramos a execução aqui para não gastar recursos ou processar o PDF.
    return;
  }

  const { data: { user }, error } = await supabaseClient.auth.getUser();

  if (error || !user) {
    alert("A sua conta não está mais ativa. Será redirecionado.");
    await supabaseClient.auth.signOut();
    location.reload();
    return;
  }

  if (!selectedBank || !selectedFile) return;
  const cfg = BANCOS[selectedBank];
  const btn = document.getElementById('btn-convert');
  const progressWrap = document.getElementById('progress-wrap');

  btn.disabled = true;
  progressWrap.classList.add('visible');
  document.getElementById('result-card').className = 'result-card';
  setProgress(0, 'A ler PDF...');

  try {
    const text = await extractTextFromPDF(selectedFile, p => {
      setProgress(p * 0.6, `A ler página ${Math.round(p * 100)}%...`);
    });
    lastPdfText = text;
    setProgress(0.65, 'A processar transações...');

    const txs = await processText(text, cfg);
    lastTransactions = txs;
    setProgress(0.9, 'A gerar ficheiro OFX...');

    if (txs.length === 0) {
      setProgress(1, 'Concluído');
      showResult('warning', '⚠️', 'Nenhuma transação encontrada',
        `<p style="color:var(--muted);font-size:14px;line-height:1.7">O PDF foi lido com sucesso, mas nenhuma transação foi identificada.<br>
        O layout do extrato pode não corresponder ao banco selecionado.<br>
        Use o botão <strong style="color:var(--accent3)">🔍 Ver Raio-X</strong> para diagnosticar o problema.</p>`);
    } else {
      const ofxContent = generateOFX(txs, cfg.bank_id);
      setProgress(1, `${txs.length} transações processadas ✓`);

      const credits = txs.filter(t => t.amount > 0);
      const debits = txs.filter(t => t.amount < 0);
      const totalC = credits.reduce((s, t) => s + t.amount, 0);
      const totalD = debits.reduce((s, t) => s + Math.abs(t.amount), 0);

      const txListHTML = txs.slice(0, 50).map(t =>
        `<div class="tx-item">
          <span class="tx-date">${formatDateDisplay(t.date)}</span>
          <span class="tx-memo">${t.memo.replace(/</g, '&lt;')}</span>
          <span class="tx-amount ${t.amount > 0 ? 'credit' : 'debit'}">${t.amount > 0 ? '+' : '-'} R$ ${Math.abs(t.amount).toFixed(2).replace('.', ',')}</span>
        </div>`
      ).join('') + (txs.length > 50 ? `<div class="tx-item" style="justify-content:center;color:var(--muted)">... e mais ${txs.length - 50} transações</div>` : '');

      const ofxName = selectedFile.name.replace('.pdf', '.ofx');
      showResult('success', '✅', 'OFX Gerado com Sucesso', `
        <div class="result-stats">
          <div class="stat"><div class="stat-val">${txs.length}</div><div class="stat-label">Transações</div></div>
          <div class="stat"><div class="stat-val" style="color:var(--accent)">R$ ${totalC.toFixed(2).replace('.', ',')}</div><div class="stat-label">Total créditos</div></div>
          <div class="stat"><div class="stat-val" style="color:var(--accent2)">R$ ${totalD.toFixed(2).replace('.', ',')}</div><div class="stat-label">Total débitos</div></div>
        </div>
        <button class="btn-download" id="btn-dl">⬇ Baixar ${ofxName}</button>
        <div class="tx-list" id="tx-list">${txListHTML}</div>
      `);

      // Localize onde o botão de download é configurado (dentro da lógica de sucesso)
      const btnDl = document.getElementById('btn-dl');
      btnDl.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        btnDl.disabled = true;
        btnDl.innerText = "Validando...";

        const { data: { user } } = await supabaseClient.auth.getUser();

        // PRIMEIRO: Incrementa no banco
        const { error: rpcError } = await supabaseClient.rpc('increment_conversion', { user_id: user.id });

        if (!rpcError) {
          // SEGUNDO: Atualiza a interface e bloqueia botões se atingiu 3
          await verificarAcessoEPlano();

          // TERCEIRO: Só agora entrega o arquivo
          downloadOFX(ofxContent, ofxName);

          btnDl.innerText = "Download Concluído";
        } else {
          btnDl.disabled = false;
          btnDl.innerText = "Erro ao validar. Tente novamente.";
        }
      });
    }
  } catch (err) {
    setProgress(0, '');
    showResult('error', '❌', 'Erro ao processar',
      `<p style="color:var(--muted);font-size:13px;font-family:var(--font-mono)">${err.message}</p>`);
  }

  // Garante que o botão de "Converter" (o principal) volte ao estado normal
  // mas a função verificarAcessoEPlano() lá de cima vai bloqueá-lo se o limite deu 3
  btn.disabled = false;
  progressWrap.classList.remove('visible');
}); // Fim do btn-convert

// ─── X-Ray Modal Lógica ───
document.getElementById('btn-xray').addEventListener('click', async () => {
  const modal = document.getElementById('xray-modal');
  const xrayText = document.getElementById('xray-text');
  modal.classList.add('visible');

  if (!selectedFile) {
    xrayText.textContent = 'Selecione um arquivo PDF primeiro (Passo 02).';
    return;
  }

  if (lastPdfText) {
    xrayText.textContent = lastPdfText.split('\n').slice(0, 60).join('\n');
    return;
  }

  xrayText.textContent = 'A extrair texto do PDF...';
  try {
    const text = await extractTextFromPDF(selectedFile, null);
    lastPdfText = text;
    xrayText.textContent = text.split('\n').slice(0, 60).join('\n');
  } catch (e) {
    xrayText.textContent = 'Erro ao ler PDF: ' + e.message;
  }
});

const btnFecharModal = document.getElementById('modal-close');
const modalRaioX = document.getElementById('xray-modal');

if (btnFecharModal) {
  btnFecharModal.addEventListener('click', () => {
    modalRaioX.classList.remove('visible');
  });
}

if (modalRaioX) {
  modalRaioX.addEventListener('click', (e) => {
    if (e.target === modalRaioX) {
      modalRaioX.classList.remove('visible');
    }
  });
}

const stripe = Stripe('pk_test_51TReq2Fmh5VQuv7rVWKLHrpTf7JDfACfrwWbEVqS0ir9jhnsfWE3qoUjb5l378bD06zEhOpa80Bjuy7mJgsJiUMM00bIAKAYQp'); // Substitua pela sua pk_test_...

document.getElementById('btn-subscribe').addEventListener('click', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) return;

  // Para um MVP rápido, vamos redirecionar para um Payment Link do Stripe
  // que você cria no painel do Stripe (Payments > Payment Links)
  // No Payment Link, configure para "Passar ID do cliente" ou URL de sucesso
  window.location.href = 'https://buy.stripe.com/test_fZu8wP3DMdbQgqBgJn3Nm00';
});

async function verificarAcessoEPlano() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;

  // Busca os dados do perfil
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('plan_status, conversion_limit, conversions_used, last_conversion_date')
    .eq('id', user.id)
    .single();

  if (error || !profile) return false;

  const infoTexto = document.getElementById('trial-info');
  const bannerBloqueio = document.getElementById('subscription-banner'); // Card Vermelho
  const cardFixoCompra = document.getElementById('fixed-subscription-card'); // Card Verde
  const btnConverter = document.getElementById('btn-convert');
  const tagAssinatura = document.querySelector('.tag');

  const hoje = new Date().toISOString().split('T')[0];

  // 1. Lógica para Assinante Ativo (Esconde todos os banners de compra)
  if (profile.plan_status === 'active') {
    if (infoTexto) infoTexto.innerHTML = "✨ <strong>Plano Profissional Ativo</strong> (Ilimitado)";
    if (bannerBloqueio) bannerBloqueio.style.display = 'none';
    if (cardFixoCompra) cardFixoCompra.style.display = 'none';
    if (tagAssinatura) {
      tagAssinatura.textContent = "Assinatura Profissional";
      tagAssinatura.style.background = "var(--accent)";
    }
    btnConverter.disabled = false;
    btnConverter.innerText = "Converter para OFX";
    return true;
  }

  // 2. Lógica para Usuário Grátis
  let usoAtual = profile.conversions_used || 0;
  if (!profile.last_conversion_date || profile.last_conversion_date < hoje) {
    usoAtual = 0;
  }

  const limite = profile.conversion_limit || 3;
  const resta = limite - usoAtual;

  // Cálculo do tempo para o reset (Meia-noite)
  const agora = new Date();
  const amanha = new Date();
  amanha.setHours(24, 0, 0, 0);
  const horasParaReset = Math.floor((amanha - agora) / (1000 * 60 * 60));

  // 3. REGRA DE EXIBIÇÃO ÚNICA (Resolve a duplicidade da imagem)
  if (usoAtual >= limite) {
    // LIMITE ATINGIDO: Mostra apenas o banner de bloqueio (vermelho)
    if (bannerBloqueio) bannerBloqueio.style.display = 'block';
    if (cardFixoCompra) cardFixoCompra.style.display = 'none';

    btnConverter.disabled = true;
    btnConverter.innerText = "Limite Diário Atingido";
    btnConverter.style.opacity = "0.5";

    if (infoTexto) infoTexto.innerHTML = `Limite atingido! Reset em <strong>${horasParaReset} horas</strong>.`;
    if (tagAssinatura) {
      tagAssinatura.textContent = "Limite Atingido";
      tagAssinatura.style.background = "var(--accent2)";
    }
    return false;
  } else {
    // DENTRO DO LIMITE: Mostra apenas o card fixo (verde)
    if (bannerBloqueio) bannerBloqueio.style.display = 'none';
    if (cardFixoCompra) cardFixoCompra.style.display = 'block';

    btnConverter.disabled = !(selectedBank && selectedFile);
    btnConverter.innerText = "Converter para OFX";
    btnConverter.style.opacity = "1";

    if (infoTexto) infoTexto.innerHTML = `🎁 Você tem <strong>${resta}</strong> conversões grátis hoje. Reset em ${horasParaReset}h.`;
    if (tagAssinatura) {
      tagAssinatura.textContent = "Plano Gratuito";
      tagAssinatura.style.background = "#555";
    }
    return true;
  }
}

// Adicione isto junto com seus outros Event Listeners
document.getElementById('btn-subscribe-fixed').addEventListener('click', () => {
  // Redireciona para o Checkout do Stripe
  window.location.href = 'https://buy.stripe.com/test_fZu8wP3DMdbQgqBgJn3Nm00';
});

// Controle do Menu Hambúrguer
const menuBtn = document.getElementById('hamburger-menu');
const closeBtn = document.getElementById('close-menu');
const sideMenu = document.getElementById('side-menu');
const overlay = document.getElementById('sidebar-overlay');

function toggleMenu() {
  sideMenu.classList.toggle('active');
  overlay.classList.toggle('active');
}

menuBtn.onclick = toggleMenu;
closeBtn.onclick = toggleMenu;
overlay.onclick = toggleMenu;

// Funções dos itens do Menu
document.getElementById('menu-profile').onclick = async () => {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();

  toggleMenu();
  alert(`👤 PERFIL\n\nNome: ${profile.first_name} ${profile.last_name}\nEscritório: ${profile.office}\nPlano: ${profile.plan_status.toUpperCase()}`);
};

document.getElementById('menu-limits').onclick = async () => {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const { data: profile } = await supabaseClient.from('profiles').select('conversions_used, conversion_limit').eq('id', user.id).single();

  toggleMenu();
  const uso = profile.conversions_used || 0;
  const limite = profile.conversion_limit || 3;
  alert(`📊 LIMITES\n\nVocê usou ${uso} de ${limite} conversões diárias hoje.`);
};

document.getElementById('menu-about').onclick = () => {
  toggleMenu();
  alert("ℹ️ SOBRE\n\nConversor PDF para OFX Profissional v1.1\nDesenvolvido para agilizar a conciliação bancária de escritórios contábeis.");
};

// --- SISTEMA DE NAVEGAÇÃO ---

// --- LÓGICA DE NAVEGAÇÃO ENTRE TELAS ---

function navegarPara(idDaTela) {
  // 1. Esconde todas as seções dentro do app-screen
  const secoes = document.querySelectorAll('#app-screen section');
  secoes.forEach(s => s.style.display = 'none');

  // 2. Mostra a seção desejada
  const telaAlvo = document.getElementById(idDaTela);
  if (telaAlvo) {
    telaAlvo.style.display = 'block';
  }

  // 3. Fecha o menu lateral e o overlay
  const sideMenu = document.getElementById('side-menu');
  const overlay = document.getElementById('sidebar-overlay');
  if (sideMenu) sideMenu.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

// Configura os botões de "Voltar" de todas as telas
document.querySelectorAll('.back-btn').forEach(btn => {
  btn.onclick = () => navegarPara('view-converter');
});

// --- EVENTOS DO MENU HAMBÚRGUER ---

// Abrir Conversor
document.getElementById('menu-converter').onclick = () => navegarPara('view-converter');

// Abrir Perfil (Busca dados no Supabase e exibe na tela)
document.getElementById('menu-profile').onclick = async () => {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile) {
      document.getElementById('prof-name').textContent = `${profile.first_name} ${profile.last_name}`;
      document.getElementById('prof-office').textContent = profile.office;
      document.getElementById('prof-status').textContent = profile.plan_status.toUpperCase();
    }
  }
  navegarPara('view-profile'); // Abre a tela, não o popup
};

// Abrir Limites
document.getElementById('menu-limits').onclick = async () => {
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('conversions_used, conversion_limit')
      .eq('id', user.id)
      .single();

    if (profile) {
      const uso = profile.conversions_used || 0;
      const limite = profile.conversion_limit || 3;
      document.getElementById('limits-display').textContent = `${uso} / ${limite}`;

      // Opcional: Atualizar cronómetro de reset aqui
      const infoReset = document.getElementById('reset-timer-view');
      if (infoReset) infoReset.textContent = "O limite é reiniciado automaticamente à meia-noite.";
    }
  }
  navegarPara('view-limits');
};

// Abrir Sobre
document.getElementById('menu-about').onclick = () => navegarPara('view-about');

// Adicione isto junto aos outros eventos do menu/perfil
document.getElementById('btn-reset-password').onclick = async () => {
  const btn = document.getElementById('btn-reset-password');
  const msg = document.getElementById('reset-msg');

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) return;

    btn.disabled = true;
    btn.innerText = "Enviando...";

    const { error } = await supabaseClient.auth.resetPasswordForEmail(user.email, {
      redirectTo: 'https://conversor-ofx-six.vercel.app/', // URL do seu site na Vercel
    });

    if (error) throw error;

    msg.style.color = "var(--accent)";
    msg.textContent = "E-mail de redefinição enviado! Verifique sua caixa de entrada.";
    btn.innerText = "E-mail Enviado";

  } catch (err) {
    console.error("Erro ao resetar senha:", err);
    msg.style.color = "var(--accent2)";
    msg.textContent = "Erro ao enviar e-mail. Tente novamente mais tarde.";
    btn.disabled = false;
    btn.innerText = "Tentar novamente";
  }
};

// 1. Detecta que o utilizador voltou pelo link do e-mail
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    // Esconde a tela de login (se estiver aberta) e força a entrada no app
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';

    // Navega diretamente para a nossa nova tela de atualizar senha
    navegarPara('view-update-password');
  }

  // (Mantenha o resto da sua lógica SIGNED_IN / SIGNED_OUT aqui se já tiver)
});

// 2. Lógica para guardar a nova senha
document.getElementById('btn-save-new-password').onclick = async () => {
  const novaSenha = document.getElementById('new-recovery-password').value;
  const msg = document.getElementById('recovery-msg');
  const btn = document.getElementById('btn-save-new-password');

  if (novaSenha.length < 6) {
    msg.style.color = "var(--accent2)"; // Vermelho
    msg.textContent = "A senha deve ter pelo menos 6 caracteres.";
    return;
  }

  btn.disabled = true;
  msg.style.color = "var(--text)";
  msg.textContent = "A atualizar a senha...";

  // Atualiza a senha no banco de dados do Supabase
  const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });

  if (error) {
    msg.style.color = "var(--accent2)";
    msg.textContent = "Erro: " + traduzirErro(error.message);
    btn.disabled = false;
  } else {
    msg.style.color = "var(--accent)"; // Verde
    msg.textContent = "✅ Senha atualizada com sucesso!";

    // Limpa o campo e volta para o conversor após 2 segundos
    setTimeout(() => {
      document.getElementById('new-recovery-password').value = '';
      btn.disabled = false;
      msg.textContent = '';
      navegarPara('view-converter');
    }, 2000);
  }
};