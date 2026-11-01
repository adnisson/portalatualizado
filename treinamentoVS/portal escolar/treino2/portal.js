// ===============================
// CONFIGURAÇÕES
// ===============================
// código que o professor precisa digitar para se cadastrar ('' = não pede código)
const CODIGO_PROFESSOR = 'professor2026';

// false = só o professor edita as notas | true = o aluno também pode editar
const ALUNO_PODE_EDITAR_NOTAS = false;

// frequência mínima (%) para ser aprovado
const FREQUENCIA_MINIMA = 75;

// true = não deixa marcar presença em dias que ainda não chegaram
const BLOQUEAR_FUTURO = true;

const materias = [
  "Português", "Matemática", "História", "Geografia", "Biologia",
  "Física", "Química", "Sociologia", "Filosofia", "Inglês", "Educação Física"
];

const nomesMeses = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// ===============================
// ESTADO
// ===============================
let perfil = null;          // 'professor' | 'aluno' | null
let matriculaAtual = null;  // matrícula do aluno cujo boletim está na tela
let modoAluno = 'entrar';   // 'entrar' | 'primeiro' | 'trocar'
let celulasLinha = {};      // média/situação de cada matéria (atualiza sem recriar a tabela)

let calAno = new Date().getFullYear();
let calMes = new Date().getMonth();

// ===============================
// UTILITÁRIOS
// ===============================

// mostra uma mensagem no canto da tela (some sozinha; clique para fechar)
// tipo: 'ok' (verde), 'erro' (vermelho) ou 'info' (azul). Sem tipo, ele deduz pelo texto.
function aviso(texto, tipo) {
  if (!tipo) {
    if (/sucesso/i.test(texto)) tipo = 'ok';
    else if (/^(Primeiro acesso|Digite|Preencha)/.test(texto)) tipo = 'info';
    else tipo = 'erro';
  }

  let caixa = document.getElementById('avisos');
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.id = 'avisos';
    document.body.appendChild(caixa);
  }

  const el = document.createElement('div');
  el.className = 'aviso aviso-' + tipo;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status'); // leitores de tela anunciam
  el.textContent = texto;

  const fechar = function () {
    el.classList.add('saindo');
    setTimeout(function () { el.remove(); }, 250);
  };
  el.addEventListener('click', fechar);

  caixa.appendChild(el);
  while (caixa.children.length > 3) caixa.firstChild.remove(); // no máximo 3 na tela
  setTimeout(fechar, tipo === 'erro' ? 6000 : 4500);
}

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

// senha só é guardada como hash; sem suporte do navegador, o cadastro é bloqueado
function cryptoDisponivel() {
  return !!(window.crypto && crypto.subtle);
}

function exigirCrypto() {
  if (cryptoDisponivel()) return true;
  aviso('Este navegador não permite proteger a senha nesta página. Abra o site por https ou por localhost.');
  return false;
}

// gera hash SHA-256 da senha (não guarda a senha em texto puro)
async function hashSenha(texto) {
  const buf = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function matriculaValida(m) { return /^[A-Za-z0-9-]{3,20}$/.test(m); }
function emailValido(e) { return /^\S+@\S+\.\S+$/.test(e); }

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
// DADOS DOS ALUNOS (um registro por matrícula)
// ===============================
// alunosPortal = {
//   '12345': { nome, email, serie, matricula, senhaHash,
//              notas: { Português: [n1, n2, n3, n4] },   // null = ainda sem nota
//              notasFinais: { Português: null },
//              presencas: { '2026-10-08': 'P' | 'F' } }
// }
function lerAlunos() { return lerJSON('alunosPortal', {}); }
function salvarAlunos(todos) { salvarJSON('alunosPortal', todos); }

function buscarAluno(matricula) {
  const todos = lerAlunos();
  return Object.prototype.hasOwnProperty.call(todos, matricula) ? todos[matricula] : null;
}

function alunoAtual() {
  return matriculaAtual ? buscarAluno(matriculaAtual) : null;
}

// lê, aplica a mudança e grava de volta
function atualizarAlunoPor(matricula, mudanca) {
  const todos = lerAlunos();
  if (!Object.prototype.hasOwnProperty.call(todos, matricula)) return;
  mudanca(todos[matricula]);
  salvarAlunos(todos);
}

function atualizarAluno(mudanca) { atualizarAlunoPor(matriculaAtual, mudanca); }

function criarAluno(dados) {
  const notas = {};
  const notasFinais = {};
  materias.forEach(m => { notas[m] = [null, null, null, null]; notasFinais[m] = null; });
  return {
    nome: dados.nome,
    email: dados.email || '',
    serie: dados.serie || '',
    matricula: dados.matricula,
    senhaHash: null,
    notas: notas,
    notasFinais: notasFinais,
    presencas: {}
  };
}

// traz os dados da versão antiga (um aluno só) para o novo formato, uma única vez
(function migrarDadosAntigos() {
  if (Object.keys(lerAlunos()).length) return;
  const antigo = lerJSON('alunoPortal', null);
  if (!antigo || !matriculaValida(antigo.matricula || '') || !antigo.nome) return;

  const aluno = criarAluno(antigo);

  const hashAntigo = localStorage.getItem('senhaPortal') || '';
  if (/^[a-f0-9]{64}$/.test(hashAntigo)) aluno.senhaHash = hashAntigo;

  const salvo = lerJSON('notasPortal', null);
  if (salvo) {
    materias.forEach(m => {
      const lista = salvo.notas && salvo.notas[m];
      if (Array.isArray(lista) && lista.length === 4) {
        // no formato antigo, 0 significava "sem nota"
        aluno.notas[m] = lista.map(n => (Number(n) > 0 ? Number(n) : null));
      }
      const nf = salvo.notasFinais && Number(salvo.notasFinais[m]);
      aluno.notasFinais[m] = nf > 0 ? nf : null;
    });
  }

  aluno.presencas = lerJSON('presencaPortal', {});

  const todos = {};
  todos[aluno.matricula] = aluno;
  salvarAlunos(todos);
})();

function atualizarCabecalho() {
  const aluno = alunoAtual() || {};
  const semAluno = perfil === 'professor' ? 'Nenhum aluno selecionado' : '-';
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
// FREQUÊNCIA
// ===============================
function chaveData(ano, mes, dia) {
  return ano + '-' + String(mes + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}

function calcularFrequencia(aluno) {
  const valores = Object.values((aluno && aluno.presencas) || {});
  const presentes = valores.filter(v => v === 'P').length;
  const faltas = valores.filter(v => v === 'F').length;
  const total = presentes + faltas;
  return { presentes, faltas, total, percentual: total ? (presentes / total) * 100 : null };
}

// mostra a porcentagem no cartão "Dados do aluno"
function atualizarFrequencia() {
  const el = document.getElementById('alunoFrequencia');
  if (!el) return;
  const f = calcularFrequencia(alunoAtual());
  if (f.percentual === null) {
    el.innerText = 'sem registros';
    el.style.color = '';
    return;
  }
  el.innerText = f.percentual.toFixed(1).replace('.', ',') + '% (' +
    f.presentes + ' presenças, ' + f.faltas + ' faltas)';
  el.style.color = f.percentual >= FREQUENCIA_MINIMA ? 'green' : 'crimson';
}

/// clique no dia (só professor): vazio -> presente -> falta -> vazio
function alternarPresenca(chave) {
  if (perfil !== 'professor' || !alunoAtual()) return;
  atualizarAluno(function (a) {
    const atual = a.presencas[chave];
    if (!atual) a.presencas[chave] = 'P';
    else if (atual === 'P') a.presencas[chave] = 'F';
    else delete a.presencas[chave];
  });
  desenharCalendario();
  atualizarFrequencia();
  atualizarTodasAsLinhas(); // a frequência pode mudar a situação final

  // devolve o foco ao dia que acabou de ser marcado (para quem usa teclado)
  const el = document.querySelector('.calDia[data-chave="' + chave + '"]');
  if (el) el.focus({ preventScroll: true });
} 

// ===============================
// CARTÕES DE RESUMO (topo do portal)
// ===============================
function atualizarResumo() {
  const aluno = alunoAtual();
  const texto = function (id, valor) {
    const el = document.getElementById(id);
    if (el) el.innerText = valor;
  };
  const barra = document.getElementById('resFreqBar');
  const trilha = document.getElementById('resFreqTrilha');
  if (trilha) trilha.style.setProperty('--minimo', FREQUENCIA_MINIMA + '%');

  // sem aluno selecionado: tudo zerado
  if (!aluno) {
    ['resMedia', 'resFreq', 'resAprov', 'resAndamento'].forEach(id => texto(id, '-'));
    ['resMediaSub', 'resFreqSub', 'resAprovSub', 'resAndamentoSub'].forEach(id => texto(id, ''));
    if (barra) barra.style.width = '0%';
    return;
  }

  let soma = 0, comMedia = 0, aprovadas = 0, andamento = 0, pendentes = 0;
  materias.forEach(function (m) {
    const r = calcularLinha(aluno, m);
    if (r.media !== null) { soma += r.media; comMedia++; }
    if (r.situacao.indexOf('Aprovado') === 0) aprovadas++;
    else if (r.situacao === 'Em andamento') andamento++;
    else pendentes++; // prova final ou reprovado
  });

  // média geral
  texto('resMedia', comMedia ? (soma / comMedia).toFixed(1) : '-');
  texto('resMediaSub', comMedia ? 'de ' + comMedia + ' matéria(s) com nota' : 'sem notas lançadas');

  // frequência
  const f = calcularFrequencia(aluno);
  if (f.percentual === null) {
    texto('resFreq', '-');
    texto('resFreqSub', 'sem registros');
    if (barra) barra.style.width = '0%';
  } else {
    texto('resFreq', f.percentual.toFixed(0) + '%');
    texto('resFreqSub', f.presentes + ' presenças · ' + f.faltas + ' faltas');
    if (barra) barra.style.width = f.percentual + '%';
  }
  if (barra) barra.classList.toggle('baixa', f.percentual !== null && f.percentual < FREQUENCIA_MINIMA);

  // situação das matérias
  texto('resAprov', aprovadas);
  texto('resAprovSub', 'de ' + materias.length + ' matérias');
  texto('resAndamento', andamento);
  texto('resAndamentoSub', pendentes ? pendentes + ' em prova final ou reprovada(s)' : 'nenhuma pendência');
}

function desenharCalendario() {
  const grade = document.getElementById('calGrade');
  const titulo = document.getElementById('calTitulo');
  if (!grade || !titulo) return;

  const aluno = alunoAtual();
  const presencas = aluno ? aluno.presencas : {};
  const ehProfessor = perfil === 'professor';
  const nomeMes = nomesMeses[calMes].toLowerCase();
  titulo.innerText = nomesMeses[calMes] + ' ' + calAno;
  grade.innerHTML = '';
  grade.classList.toggle('leitura', !ehProfessor);

  const dica = document.querySelector('.calDica');
  if (dica) dica.style.display = ehProfessor ? 'block' : 'none';

  const primeiroDia = new Date(calAno, calMes, 1).getDay(); // 0 = domingo
  const diasNoMes = new Date(calAno, calMes + 1, 0).getDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let presentesMes = 0;
  let faltasMes = 0;

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
    el.setAttribute('data-chave', chave);

    const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
    const futuro = BLOQUEAR_FUTURO && data > hoje;
    let estado = '';

    if (fimDeSemana || futuro) {
      el.classList.add('bloqueado');
    } else {
      if (presencas[chave] === 'P') { el.classList.add('presente'); estado = 'presente'; presentesMes++; }
      if (presencas[chave] === 'F') { el.classList.add('falta'); estado = 'falta'; faltasMes++; }

      if (ehProfessor && aluno) {
        el.onclick = function () { alternarPresenca(chave); };
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.onkeydown = function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            alternarPresenca(chave);
          }
        };
      }
    }

    // leitores de tela: "8 de outubro: presente"
    el.setAttribute('aria-label', dia + ' de ' + nomeMes + (estado ? ': ' + estado : ''));

    if (data.getTime() === hoje.getTime()) el.classList.add('hoje');
    grade.appendChild(el);
  }

  // resumo do mês, embaixo da grade
  const resumo = document.getElementById('calResumoMes');
  if (resumo) {
    resumo.innerText = (presentesMes || faltasMes)
      ? presentesMes + (presentesMes === 1 ? ' presença' : ' presenças') + ' · ' +
        faltasMes + (faltasMes === 1 ? ' falta' : ' faltas') + ' em ' + nomeMes
      : 'Sem registros em ' + nomeMes;
  }
}

function mudarMes(delta) {
  calMes += delta;
  if (calMes < 0) { calMes = 11; calAno--; }
  if (calMes > 11) { calMes = 0; calAno++; }
  desenharCalendario();
}

// ===============================
// BOLETIM
// ===============================
function calcularLinha(aluno, materia) {
  const lancadas = aluno.notas[materia].filter(n => n !== null);
  const completo = lancadas.length === 4;
  const media = lancadas.length
    ? lancadas.reduce((a, b) => a + b, 0) / lancadas.length
    : null;
  const final = aluno.notasFinais[materia];

  let situacao;
  if (!completo) situacao = 'Em andamento';
  else if (media >= 6) situacao = 'Aprovado';
  else if (final !== null) situacao = ((media + final) / 2 >= 5) ? 'Aprovado na Final' : 'Reprovado';
  else situacao = 'Prova final';

  // com o ano fechado, a frequência abaixo do mínimo reprova mesmo com boa nota
  if (completo && situacao.indexOf('Aprovado') === 0) {
    const f = calcularFrequencia(aluno);
    if (f.percentual !== null && f.percentual < FREQUENCIA_MINIMA) situacao = 'Reprovado por falta';
  }

  return { media, final, situacao };
}

// pinta a situação: verde (aprovado), amarelo (em andamento / prova final), vermelho (reprovado)
function aplicarSituacao(td, situacao) {
  td.innerText = situacao;
  td.className = 'situacao';
  if (situacao.indexOf('Aprovado') === 0) td.classList.add('sitAprovado');
  else if (situacao.indexOf('Reprovado') === 0) td.classList.add('sitReprovado');
  else td.classList.add('sitAtencao');
}

function textoMedia(media) { return media === null ? '-' : media.toFixed(1); }

function atualizarLinha(materia) {
  const c = celulasLinha[materia];
  const aluno = alunoAtual();
  if (!c || !aluno) return;
  const r = calcularLinha(aluno, materia);
  c.media.innerText = textoMedia(r.media);
    aplicarSituacao(c.situacao, r.situacao);
    atualizarResumo();
}

function atualizarTodasAsLinhas() {
  materias.forEach(atualizarLinha);
}

function carregarBoletim() {
  atualizarCabecalho();
  const boletim = document.getElementById('boletim');
  if (!boletim) return;
  boletim.innerHTML = '';
  celulasLinha = {};

  const aluno = alunoAtual();
  if (!aluno) {
    boletim.innerHTML = '<tr><td colspan="8">' +
      (perfil === 'professor' ? 'Cadastre ou selecione um aluno.' : 'Aluno não encontrado.') +
      '</td></tr>';
    return;
  }

  const podeEditar = perfil === 'professor' || ALUNO_PODE_EDITAR_NOTAS;

  materias.forEach(materia => {
    const r = calcularLinha(aluno, materia);
    const tr = document.createElement('tr');

    const tdMat = document.createElement('td');
    tdMat.innerHTML = '<strong>' + materia + '</strong>';
    tr.appendChild(tdMat);

    for (let b = 0; b < 4; b++) {
      const td = document.createElement('td');
      const n = aluno.notas[materia][b];
      td.innerText = n === null ? '' : n;
      if (podeEditar) {
        td.contentEditable = true;
        td.onblur = function () { editarNota(materia, b, this); };
        td.onkeydown = function (e) { moverProximaCelula(e, this); };
        td.onfocus = function () { const el = this; setTimeout(() => selecionarConteudo(el), 0); };
      }
      tr.appendChild(td);
    }

    const tdMed = document.createElement('td');
    tdMed.innerText = textoMedia(r.media);
    tr.appendChild(tdMed);

    const tdFinal = document.createElement('td');
    tdFinal.innerText = r.final === null ? '' : r.final;
    if (podeEditar) {
      tdFinal.contentEditable = true;
      tdFinal.onblur = function () { editarFinal(materia, this); };
      tdFinal.onkeydown = function (e) { moverProximaCelula(e, this); };
      tdFinal.onfocus = function () { const el = this; setTimeout(() => selecionarConteudo(el), 0); };
    }
    tr.appendChild(tdFinal);

            const tdSit = document.createElement('td');
    aplicarSituacao(tdSit, r.situacao);
    tr.appendChild(tdSit);

    celulasLinha[materia] = { media: tdMed, situacao: tdSit };
    boletim.appendChild(tr);
  });
}

// converte o texto digitado em nota de 0 a 10 (vazio = sem nota)
function normalizarNota(texto) {
  const t = (texto || '').toString().trim().replace(',', '.');
  if (t === '') return null;
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(10, n));
}

// valida e salva nota bimestral (atualiza só a linha, sem recriar a tabela)
function editarNota(materia, bimestre, td) {
  const nota = normalizarNota(td.innerText);
  atualizarAluno(a => { a.notas[materia][bimestre] = nota; });
  td.innerText = nota === null ? '' : nota;
  atualizarLinha(materia);
}

// valida e salva prova final
function editarFinal(materia, td) {
  const nf = normalizarNota(td.innerText);
  atualizarAluno(a => { a.notasFinais[materia] = nf; });
  td.innerText = nf === null ? '' : nf;
  atualizarLinha(materia);
}

// ===============================
// PORTAL
// ===============================
function atualizarTela() {
  carregarBoletim();
  desenharCalendario();
  atualizarFrequencia();
  atualizarResumo();
}

// lista de alunos que o professor escolhe
function preencherSeletor() {
  const sel = document.getElementById('selAluno');
  if (!sel) return;
  const alunos = Object.values(lerAlunos())
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  sel.innerHTML = '';
  if (!alunos.length) {
    sel.add(new Option('Nenhum aluno cadastrado', ''));
    matriculaAtual = null;
    return;
  }
  alunos.forEach(a => sel.add(new Option(a.nome + ' (' + a.matricula + ')', a.matricula)));
  if (!matriculaAtual || !buscarAluno(matriculaAtual)) matriculaAtual = alunos[0].matricula;
  sel.value = matriculaAtual;
}

function abrirPortal() {
  mostrarPagina('paginaPortal');
  const info = document.getElementById('infoPerfil');
  if (info) info.innerText = perfil === 'professor' ? 'Acesso: Professor' : 'Acesso: Aluno';

  const painel = document.getElementById('painelProfessor');
  if (painel) painel.style.display = perfil === 'professor' ? 'block' : 'none';
  if (perfil === 'professor') preencherSeletor();

  atualizarTela();
}

// ===============================
// LOGIN: formulários
// ===============================
function resetarFormAluno() {
  modoAluno = 'entrar';
  ['matricula', 'senha', 'confirmarSenha'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const bloco = document.getElementById('blocoConfirmar');
  if (bloco) bloco.style.display = 'none';
  const rotulo = document.querySelector('label[for="confirmarSenha"]');
  if (rotulo) rotulo.innerText = 'Confirmar senha';
  const btnEntrar = document.getElementById('btnEntrar');
  if (btnEntrar) btnEntrar.innerText = 'Entrar';
  const btnTrocar = document.getElementById('btnTrocarSenhaFormulario');
  if (btnTrocar) btnTrocar.innerText = 'Trocar Senha';
}

function resetarFormProfessor() {
  ['profEmail', 'profSenha', 'profConfirmar', 'profCodigo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const bloco = document.getElementById('blocoCadastroProf');
  if (bloco) bloco.style.display = 'none';
}

// ajusta o formulário do aluno conforme a matrícula digitada (primeiro acesso ou login)
function configurarModoAluno() {
  if (modoAluno === 'trocar') return;
  const mat = (document.getElementById('matricula')?.value || '').trim();
  const aluno = buscarAluno(mat);
  const primeiro = !!aluno && !aluno.senhaHash;

  modoAluno = primeiro ? 'primeiro' : 'entrar';
  const bloco = document.getElementById('blocoConfirmar');
  if (bloco) bloco.style.display = primeiro ? 'block' : 'none';
  const btn = document.getElementById('btnEntrar');
  if (btn) btn.innerText = primeiro ? 'Cadastrar senha' : 'Entrar';
  const senha = document.getElementById('senha');
  if (senha) senha.placeholder = primeiro ? 'Crie sua senha' : 'Digite sua senha';
}

async function concluirTrocaSenha() {
  if (!exigirCrypto()) return;
  const mat = (document.getElementById('matricula')?.value || '').trim();
  const atual = document.getElementById('senha')?.value || '';
  const nova = document.getElementById('confirmarSenha')?.value || '';

  const aluno = buscarAluno(mat);
  if (!aluno || !aluno.senhaHash) return aviso('Matrícula não encontrada ou sem senha cadastrada.');
  if (await hashSenha(atual) !== aluno.senhaHash) return aviso('Matrícula ou senha atual incorretos.');
  if (nova.length < 4) return aviso('A nova senha precisa ter pelo menos 4 caracteres.');

  const novoHash = await hashSenha(nova);
  atualizarAlunoPor(mat, a => { a.senhaHash = novoHash; });
  aviso('Senha alterada com sucesso!');
  resetarFormAluno();
}

// ===============================
// INICIALIZAÇÃO (espera o HTML carregar)
// ===============================
document.addEventListener('DOMContentLoaded', function () {
  mostrarPagina('paginaEscolha');

  // TELA DE ESCOLHA
  document.getElementById('btnSouProfessor')?.addEventListener('click', () => {
    resetarFormProfessor();
    mostrarPagina('paginaProfessor');
  });
  document.getElementById('btnSouAluno')?.addEventListener('click', () => {
    resetarFormAluno();
    mostrarPagina('paginaFormulario');
  });
  document.querySelectorAll('.btnVoltar').forEach(b => {
    b.addEventListener('click', () => {
      resetarFormAluno();
      resetarFormProfessor();
      mostrarPagina('paginaEscolha');
    });
  });

  // CALENDÁRIO: setas de mês
  document.getElementById('calAnterior')?.addEventListener('click', () => mudarMes(-1));
  document.getElementById('calProximo')?.addEventListener('click', () => mudarMes(1));

  // ---------- ALUNO: LOGIN / PRIMEIRO ACESSO ----------
  document.getElementById('matricula')?.addEventListener('input', configurarModoAluno);

  document.getElementById('meuFormulario')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (modoAluno === 'trocar') return concluirTrocaSenha();
    if (!exigirCrypto()) return;

    const mat = (document.getElementById('matricula')?.value || '').trim();
    const senha = document.getElementById('senha')?.value || '';
    if (!mat || !senha) return aviso('Informe matrícula e senha.');

    const aluno = buscarAluno(mat);
    if (!aluno) return aviso('Matrícula não encontrada. Procure a secretaria da escola.');

    if (!aluno.senhaHash) {
      // primeiro acesso: o aluno cria a senha
      if (modoAluno !== 'primeiro') {
        configurarModoAluno();
        return aviso('Primeiro acesso: confirme a senha para cadastrá-la.');
      }
      if (senha.length < 4) return aviso('A senha precisa ter pelo menos 4 caracteres.');
      if (senha !== (document.getElementById('confirmarSenha')?.value || '')) {
        return aviso('As senhas não conferem. Tente novamente.');
      }
      const novoHash = await hashSenha(senha);
      atualizarAlunoPor(mat, a => { a.senhaHash = novoHash; });
      aviso('Senha cadastrada com sucesso! Bem-vindo!');
    } else if (await hashSenha(senha) !== aluno.senhaHash) {
      return aviso('Matrícula ou senha incorretos.');
    }

    perfil = 'aluno';
    matriculaAtual = mat;
    abrirPortal();
  });

  // ALUNO: TROCAR SENHA (1º clique abre o campo da nova senha, 2º clique conclui)
  document.getElementById('btnTrocarSenhaFormulario')?.addEventListener('click', function () {
    if (modoAluno !== 'trocar') {
      modoAluno = 'trocar';
      const bloco = document.getElementById('blocoConfirmar');
      if (bloco) bloco.style.display = 'block';
      const rotulo = document.querySelector('label[for="confirmarSenha"]');
      if (rotulo) rotulo.innerText = 'Nova senha';
      const btnEntrar = document.getElementById('btnEntrar');
      if (btnEntrar) btnEntrar.innerText = 'Entrar';
      this.innerText = 'Confirmar troca';
      return aviso('Digite a matrícula, a senha atual e a nova senha. Depois clique em "Confirmar troca".');
    }
    concluirTrocaSenha();
  });

  // ---------- PROFESSOR: ENTRAR ----------
  document.getElementById('formProfessor')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!exigirCrypto()) return;
    const email = (document.getElementById('profEmail')?.value || '').trim().toLowerCase();
    const senha = document.getElementById('profSenha')?.value || '';
    if (!email || !senha) return aviso('Informe email e senha.');

    const professores = lerJSON('professoresPortal', {});
    if (!Object.prototype.hasOwnProperty.call(professores, email)) {
      return aviso('Professor não cadastrado. Clique em "Cadastrar".');
    }
    if (await hashSenha(senha) !== professores[email]) return aviso('Senha incorreta.');

    perfil = 'professor';
    abrirPortal();
  });

  // ---------- PROFESSOR: CADASTRAR (1º clique mostra os campos extras, 2º conclui) ----------
  document.getElementById('btnProfCadastrar')?.addEventListener('click', async function () {
    const bloco = document.getElementById('blocoCadastroProf');
    if (bloco && bloco.style.display === 'none') {
      bloco.style.display = 'block';
      return aviso('Preencha email, senha, confirmação e o código da escola. Depois clique em "Cadastrar" de novo.');
    }
    if (!exigirCrypto()) return;

    const email = (document.getElementById('profEmail')?.value || '').trim().toLowerCase();
    const senha = document.getElementById('profSenha')?.value || '';
    const confirmar = document.getElementById('profConfirmar')?.value || '';
    const codigo = document.getElementById('profCodigo')?.value || '';

    if (!emailValido(email)) return aviso('Informe um email válido.');
    if (senha.length < 4) return aviso('A senha precisa ter pelo menos 4 caracteres.');
    if (confirmar !== senha) return aviso('As senhas não conferem. Tente novamente.');
    if (CODIGO_PROFESSOR && codigo !== CODIGO_PROFESSOR) return aviso('Código da escola inválido.');

    const professores = lerJSON('professoresPortal', {});
    if (Object.prototype.hasOwnProperty.call(professores, email)) {
      return aviso('Este email já está cadastrado. Clique em "Entrar".');
    }

    professores[email] = await hashSenha(senha);
    salvarJSON('professoresPortal', professores);
    aviso('Professor cadastrado com sucesso! Bem-vindo!');
    perfil = 'professor';
    abrirPortal();
  });

  // ---------- PROFESSOR: ESCOLHER / CADASTRAR ALUNO ----------
  document.getElementById('selAluno')?.addEventListener('change', function () {
    matriculaAtual = this.value || null;
    atualizarTela();
  });

  document.getElementById('btnNovoAluno')?.addEventListener('click', function () {
    const form = document.getElementById('formNovoAluno');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('btnSalvarAluno')?.addEventListener('click', function () {
    const nome = (document.getElementById('novoNome')?.value || '').trim();
    const mat = (document.getElementById('novoMatricula')?.value || '').trim();
    const serie = (document.getElementById('novoSerie')?.value || '').trim();
    const email = (document.getElementById('novoEmail')?.value || '').trim();

    if (nome.length < 3) return aviso('Informe o nome completo do aluno.');
    if (!matriculaValida(mat)) return aviso('Matrícula inválida: use de 3 a 20 letras, números ou hífen.');
    if (!serie) return aviso('Informe a série.');
    if (email && !emailValido(email)) return aviso('Email inválido.');
    if (buscarAluno(mat)) return aviso('Já existe um aluno com essa matrícula.');

    const todos = lerAlunos();
    todos[mat] = criarAluno({ nome: nome, matricula: mat, serie: serie, email: email });
    salvarAlunos(todos);

    ['novoNome', 'novoMatricula', 'novoSerie', 'novoEmail'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('formNovoAluno').style.display = 'none';

    matriculaAtual = mat;
    preencherSeletor();
    atualizarTela();
  });

  // ---------- SAIR ----------
  document.getElementById('btnSair')?.addEventListener('click', function () {
    perfil = null;
    matriculaAtual = null;
    resetarFormAluno();
    resetarFormProfessor();
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