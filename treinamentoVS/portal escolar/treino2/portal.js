// ===============================
// ESTADO / DADOS
// ===============================
let senhaSalva = localStorage.getItem('senhaPortal'); // HASH da senha do aluno

// se existir uma senha antiga (texto puro, de versões anteriores do script),
// ela nunca bate com o hash novo: descarta e força um novo cadastro
if (senhaSalva && window.crypto && crypto.subtle && !/^[a-f0-9]{64}$/.test(senhaSalva)) {
  localStorage.removeItem('senhaPortal');
  senhaSalva = null;
}

// quem está usando o portal agora: 'professor' | 'aluno' | null
let perfil = null;

// código que o professor precisa digitar para se cadastrar ('' = não pede código)
const CODIGO_PROFESSOR = 'professor2026';

// false = só o professor edita as notas | true = o aluno também pode editar
const ALUNO_PODE_EDITAR_NOTAS = false;

const materias = [
  "Português", "Matemática", "História", "Geografia", "Biologia",
  "Física", "Química", "Sociologia", "Filosofia", "Inglês", "Educação Física"
];

const notas = {};
const notasFinais = {};
materias.forEach(m => { notas[m] = [0, 0, 0, 0]; notasFinais[m] = 0; });

// ===============================
// UTILITÁRIOS
// ===============================

// lê / grava JSON no localStorage sem quebrar se o navegador bloquear
function lerJSON(chave, padrao) {
  try {
    const v = JSON.parse(localStorage.getItem(chave));
    return v == null ? padrao : v;
  } catch (e) { return padrao; }
}

function salvarJSON(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem storage */ }
}

// gera hash SHA-256 da senha (não guarda a senha em texto puro)
async function hashSenha(texto) {
  if (!window.crypto || !crypto.subtle) return texto; // fallback
  const buf = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// seleciona todo o conteúdo da célula: o que for digitado substitui o valor atual
function selecionarConteudo(el) {
  if (!el) return;
  el.focus();
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) { /* fallback silencioso */ }
}

// navegação Enter entre células editáveis
function moverProximaCelula(event, elemento) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const td = (elemento && elemento.tagName === 'TD')
      ? elemento
      : (elemento && elemento.closest ? elemento.closest('td') : null);
    if (!td) return;
    const celulas = Array.from(document.querySelectorAll('#boletim td[contenteditable]'));
    const idx = celulas.indexOf(td);
    if (idx >= 0 && idx < celulas.length - 1) {
      const prox = celulas[idx + 1];
      setTimeout(() => selecionarConteudo(prox), 0);
    } else {
      td.blur(); // última célula: só confirma o valor
    }
  }
}

// controla qual "tela" aparece: paginaEscolha | paginaProfessor | paginaFormulario | paginaPortal
function mostrarPagina(id) {
  ['paginaEscolha', 'paginaProfessor', 'paginaFormulario'].forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = (p === id) ? 'block' : 'none';
  });
  const portal = document.getElementById('paginaPortal');
  if (portal) portal.style.display = (id === 'paginaPortal') ? 'flex' : 'none';
}

// ===============================
// DADOS DO ALUNO (cartão)
// ===============================
function lerPerfilAluno() {
  return lerJSON('alunoPortal', null);
}

function atualizarCabecalho() {
  const aluno = lerPerfilAluno() || {};
  const semAluno = perfil === 'professor' ? 'Nenhum aluno cadastrado' : '-';
  const dados = {
    alunoNome: aluno.nome || semAluno,
    alunoSerie: aluno.serie || '-',
    alunoEmail: aluno.email || '-',
    alunoMatricula: aluno.matricula || '-'
  };

  Object.keys(dados).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = dados[id];
  });
}

// ===============================
// NOTAS (salvas no navegador)
// ===============================
function salvarNotas() {
  salvarJSON('notasPortal', { notas, notasFinais });
}

(function carregarNotasSalvas() {
  const salvo = lerJSON('notasPortal', null);
  if (!salvo) return;
  materias.forEach(m => {
    const lista = salvo.notas && salvo.notas[m];
    if (Array.isArray(lista) && lista.length === 4) {
      notas[m] = lista.map(n => Number(n) || 0);
    }
    if (salvo.notasFinais) {
      notasFinais[m] = Number(salvo.notasFinais[m]) || 0;
    }
  });
})();

// ===============================
// BOLETIM
// ===============================
const celulasLinha = {}; // guarda média/situação de cada matéria para atualizar sem recriar a tabela

function calcularLinha(materia) {
  const soma = notas[materia].reduce((a, b) => a + Number(b || 0), 0);
  const media = soma / 4;
  const final = Number(notasFinais[materia] || 0);

  let situacao = '';
  if (media >= 6) situacao = 'Aprovado';
  else if (final > 0) {
    const mediaFinal = (media + final) / 2;
    situacao = mediaFinal >= 5 ? 'Aprovado na Final' : 'Reprovado';
  } else situacao = 'Recuperação';

  return { media, final, situacao };
}

function atualizarLinha(materia) {
  const c = celulasLinha[materia];
  if (!c) return;
  const r = calcularLinha(materia);
  c.media.innerText = r.media.toFixed(1);
  c.situacao.innerText = r.situacao;
}

function carregarBoletim() {
  atualizarCabecalho();
  const boletim = document.getElementById('boletim');
  if (!boletim) return;
  boletim.innerHTML = '';

  const podeEditar = perfil === 'professor' || ALUNO_PODE_EDITAR_NOTAS;

  materias.forEach(materia => {
    const r = calcularLinha(materia);
    const tr = document.createElement('tr');

    const tdMat = document.createElement('td');
    tdMat.innerHTML = '<strong>' + materia + '</strong>';
    tr.appendChild(tdMat);

    for (let b = 0; b < 4; b++) {
      const td = document.createElement('td');
      td.innerText = notas[materia][b] != null ? notas[materia][b] : '';
      if (podeEditar) {
        td.contentEditable = true;
        td.onblur = function () { editarNota(materia, b, this); };
        td.onkeydown = function (e) { moverProximaCelula(e, this); };
        td.onfocus = function () { const el = this; setTimeout(() => selecionarConteudo(el), 0); };
      }
      tr.appendChild(td);
    }

    const tdMed = document.createElement('td');
    tdMed.innerText = r.media.toFixed(1);
    tr.appendChild(tdMed);

    const tdFinal = document.createElement('td');
    tdFinal.innerText = r.final ? r.final : '';
    if (podeEditar) {
      tdFinal.contentEditable = true;
      tdFinal.onblur = function () { editarFinal(materia, this); };
      tdFinal.onkeydown = function (e) { moverProximaCelula(e, this); };
      tdFinal.onfocus = function () { const el = this; setTimeout(() => selecionarConteudo(el), 0); };
    }
    tr.appendChild(tdFinal);

    const tdSit = document.createElement('td');
    tdSit.innerText = r.situacao;
    tr.appendChild(tdSit);

    celulasLinha[materia] = { media: tdMed, situacao: tdSit };
    boletim.appendChild(tr);
  });
}

// converte o texto digitado em nota de 0 a 10
function normalizarNota(texto) {
  let n = parseFloat((texto || '').toString().trim().replace(',', '.'));
  if (isNaN(n)) n = 0;
  return Math.max(0, Math.min(10, n));
}

// valida e salva nota bimestral (atualiza só a linha, sem recriar a tabela)
function editarNota(materia, bimestre, td) {
  const nota = normalizarNota(td.innerText);
  notas[materia][bimestre] = nota;
  td.innerText = nota;
  salvarNotas();
  atualizarLinha(materia);
}

// valida e salva prova final
function editarFinal(materia, td) {
  const nf = normalizarNota(td.innerText);
  notasFinais[materia] = nf;
  td.innerText = nf ? nf : '';
  salvarNotas();
  atualizarLinha(materia);
}

// ===============================
// FREQUÊNCIA / CALENDÁRIO
// ===============================
const BLOQUEAR_FUTURO = true; // true = não deixa marcar presença em dias que ainda não chegaram
const nomesMeses = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// presencas: { '2026-10-08': 'P' (presente) ou 'F' (falta) }
let presencas = lerJSON('presencaPortal', {});

let calAno = new Date().getFullYear();
let calMes = new Date().getMonth();

function chaveData(ano, mes, dia) {
  return ano + '-' + String(mes + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}

function salvarPresencas() {
  salvarJSON('presencaPortal', presencas);
}

function calcularFrequencia() {
  const valores = Object.values(presencas);
  const presentes = valores.filter(v => v === 'P').length;
  const faltas = valores.filter(v => v === 'F').length;
  const total = presentes + faltas;
  return { presentes, faltas, total, percentual: total ? (presentes / total) * 100 : null };
}

// mostra a porcentagem no cartão "Dados do aluno"
function atualizarFrequencia() {
  const el = document.getElementById('alunoFrequencia');
  if (!el) return;
  const f = calcularFrequencia();
  if (f.percentual === null) {
    el.innerText = 'sem registros';
    el.style.color = '';
    return;
  }
  el.innerText = f.percentual.toFixed(1).replace('.', ',') + '% (' +
    f.presentes + ' presenças, ' + f.faltas + ' faltas)';
  el.style.color = f.percentual >= 75 ? 'green' : 'crimson';
}

// clique no dia (só professor): vazio -> presente -> falta -> vazio
function alternarPresenca(chave) {
  if (perfil !== 'professor') return;
  const atual = presencas[chave];
  if (!atual) presencas[chave] = 'P';
  else if (atual === 'P') presencas[chave] = 'F';
  else delete presencas[chave];
  salvarPresencas();
  desenharCalendario();
  atualizarFrequencia();
}

function desenharCalendario() {
  const grade = document.getElementById('calGrade');
  const titulo = document.getElementById('calTitulo');
  if (!grade || !titulo) return;

  const ehProfessor = perfil === 'professor';
  titulo.innerText = nomesMeses[calMes] + ' ' + calAno;
  grade.innerHTML = '';
  grade.classList.toggle('leitura', !ehProfessor);

  const dica = document.querySelector('.calDica');
  if (dica) dica.style.display = ehProfessor ? 'block' : 'none';

  const primeiroDia = new Date(calAno, calMes, 1).getDay(); // 0 = domingo
  const diasNoMes = new Date(calAno, calMes + 1, 0).getDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (let i = 0; i < primeiroDia; i++) {
    const vazio = document.createElement('div');
    vazio.className = 'calDia vazio';
    grade.appendChild(vazio);
  }

  for (let dia = 1; dia <= diasNoMes; dia++) {
    const data = new Date(calAno, calMes, dia);
    const chave = chaveData(calAno, calMes, dia);
    const el = document.createElement('div');
    el.className = 'calDia';
    el.innerText = dia;

    const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
    const futuro = BLOQUEAR_FUTURO && data > hoje;

    if (fimDeSemana || futuro) {
      el.classList.add('bloqueado');
    } else {
      if (presencas[chave] === 'P') el.classList.add('presente');
      if (presencas[chave] === 'F') el.classList.add('falta');
      if (ehProfessor) el.onclick = function () { alternarPresenca(chave); };
    }

    if (data.getTime() === hoje.getTime()) el.classList.add('hoje');
    grade.appendChild(el);
  }
}

function mudarMes(delta) {
  calMes += delta;
  if (calMes < 0) { calMes = 11; calAno--; }
  if (calMes > 11) { calMes = 0; calAno++; }
  desenharCalendario();
}

// ===============================
// LOGIN / CADASTRO
// ===============================

// ajusta o texto do botão do ALUNO conforme exista ou não senha cadastrada
function atualizarModoLogin() {
  const btn = document.querySelector('#meuFormulario button[type="submit"], #meuFormulario input[type="submit"]');
  const inputSenha = document.getElementById('senha');
  if (!senhaSalva) {
    if (btn) { if (btn.tagName === 'INPUT') btn.value = 'Cadastrar senha'; else btn.innerText = 'Cadastrar senha'; }
    if (inputSenha) inputSenha.placeholder = 'Crie sua senha';
  } else {
    if (btn) { if (btn.tagName === 'INPUT') btn.value = 'Entrar'; else btn.innerText = 'Entrar'; }
    if (inputSenha) inputSenha.placeholder = 'Digite sua senha';
  }
}

function abrirPortal() {
  mostrarPagina('paginaPortal');
  const info = document.getElementById('infoPerfil');
  if (info) info.innerText = perfil === 'professor' ? 'Acesso: Professor' : 'Acesso: Aluno';
  carregarBoletim();
  desenharCalendario();
  atualizarFrequencia();
}

function entrarComoAluno() {
  salvarJSON('alunoPortal', {
    nome: document.getElementById('nome')?.value.trim() || '',
    email: document.getElementById('email')?.value.trim() || '',
    serie: document.getElementById('serie')?.value.trim() || '',
    matricula: document.getElementById('matricula')?.value.trim() || ''
  });
  perfil = 'aluno';
  abrirPortal();
}

// ===============================
// INICIALIZAÇÃO (espera o HTML carregar)
// ===============================
document.addEventListener('DOMContentLoaded', function () {
  mostrarPagina('paginaEscolha');
  atualizarModoLogin();

  // TELA DE ESCOLHA
  document.getElementById('btnSouProfessor')?.addEventListener('click', () => mostrarPagina('paginaProfessor'));
  document.getElementById('btnSouAluno')?.addEventListener('click', () => mostrarPagina('paginaFormulario'));
  document.querySelectorAll('.btnVoltar').forEach(b => {
    b.addEventListener('click', () => mostrarPagina('paginaEscolha'));
  });

  // CALENDÁRIO: setas de mês
  document.getElementById('calAnterior')?.addEventListener('click', () => mudarMes(-1));
  document.getElementById('calProximo')?.addEventListener('click', () => mudarMes(1));

  // ---------- ALUNO: LOGIN / CADASTRO ----------
  document.getElementById('meuFormulario')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const senha = document.getElementById('senha')?.value || '';
    if (!senha) return alert('Informe a senha');

    // primeiro acesso: cadastro da senha
    if (!senhaSalva) {
      if (senha.length < 4) return alert('A senha precisa ter pelo menos 4 caracteres');
      const confirmar = prompt('Confirme a senha cadastrada:');
      if (confirmar === null) return;
      if (confirmar !== senha) return alert('As senhas não conferem. Tente novamente.');

      senhaSalva = await hashSenha(senha);
      localStorage.setItem('senhaPortal', senhaSalva);
      atualizarModoLogin();
      alert('Senha cadastrada com sucesso! Bem-vindo!');
      return entrarComoAluno();
    }

    // acessos seguintes: login
    if (await hashSenha(senha) !== senhaSalva) {
      return alert('Senha incorreta');
    }
    entrarComoAluno();
  });

  // ALUNO: TROCAR SENHA
  document.getElementById('btnTrocarSenhaFormulario')?.addEventListener('click', async function () {
    if (!senhaSalva) return alert('Nenhuma senha cadastrada ainda! Faça o primeiro cadastro.');
    const atual = prompt('Digite a senha atual:');
    if (atual === null) return;
    if (await hashSenha(atual) !== senhaSalva) return alert('Senha incorreta!');
    const nova = prompt('Digite a nova senha:');
    if (!nova || nova.trim().length < 4) return alert('Senha inválida (mínimo 4 caracteres)');
    senhaSalva = await hashSenha(nova);
    localStorage.setItem('senhaPortal', senhaSalva);
    alert('Senha alterada com sucesso!');
  });

  // ---------- PROFESSOR: ENTRAR ----------
  document.getElementById('formProfessor')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = (document.getElementById('profEmail')?.value || '').trim().toLowerCase();
    const senha = document.getElementById('profSenha')?.value || '';
    if (!email || !senha) return alert('Informe email e senha');

    const professores = lerJSON('professoresPortal', {});
    if (!professores[email]) return alert('Professor não cadastrado. Clique em "Cadastrar".');
    if (await hashSenha(senha) !== professores[email]) return alert('Senha incorreta');

    perfil = 'professor';
    abrirPortal();
  });

  // ---------- PROFESSOR: CADASTRAR ----------
  document.getElementById('btnProfCadastrar')?.addEventListener('click', async function () {
    const email = (document.getElementById('profEmail')?.value || '').trim().toLowerCase();
    const senha = document.getElementById('profSenha')?.value || '';

    if (!/^\S+@\S+\.\S+$/.test(email)) return alert('Informe um email válido');
    if (senha.length < 4) return alert('A senha precisa ter pelo menos 4 caracteres');

    const professores = lerJSON('professoresPortal', {});
    if (professores[email]) return alert('Este email já está cadastrado. Clique em "Entrar".');

    if (CODIGO_PROFESSOR) {
      const codigo = prompt('Digite o código de autorização da escola:');
      if (codigo === null) return;
      if (codigo !== CODIGO_PROFESSOR) return alert('Código inválido.');
    }

    const confirmar = prompt('Confirme a senha:');
    if (confirmar === null) return;
    if (confirmar !== senha) return alert('As senhas não conferem. Tente novamente.');

    professores[email] = await hashSenha(senha);
    salvarJSON('professoresPortal', professores);
    alert('Professor cadastrado com sucesso! Bem-vindo!');
    perfil = 'professor';
    abrirPortal();
  });

  // ---------- SAIR ----------
  document.getElementById('btnSair')?.addEventListener('click', function () {
    perfil = null;
    ['senha', 'profSenha'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    mostrarPagina('paginaEscolha');
  });
});

// ===============================
// IMPRIMIR / SALVAR BOLETIM EM PDF
// ===============================
function imprimirBoletim() {
  const nome = document.getElementById('alunoNome')?.innerText || 'aluno';
  const emissao = document.getElementById('dataEmissao');
  if (emissao) emissao.innerText = 'Emitido em ' + new Date().toLocaleDateString('pt-BR');

  const tituloOriginal = document.title;
  document.title = 'Boletim - ' + nome; // vira o nome sugerido do PDF
  window.print();
  document.title = tituloOriginal;
}

document.getElementById('btnImprimir')?.addEventListener('click', imprimirBoletim);