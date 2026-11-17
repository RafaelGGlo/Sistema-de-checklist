import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listarUsuarios, salvarUsuario, excluirUsuario } from '../lib/usuarios';
import './usuarios.css';

const novoCadastro = () => ({ nome: '', email: '', senha: '', perfil: 'motorista', ativo: true });

export default function Usuarios({ usuarioId }) {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState('');
  const [salvando, setSalvando] = useState(false);
  const dialog = useRef(null);
  const dialogExcluir = useRef(null);
  const [exclusao, setExclusao] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState('');
  const [nomeConfirmacao, setNomeConfirmacao] = useState('');
  const controle = useRef({ versao: 0 }).current;

  const carregar = useCallback(async () => {
    const atual = ++controle.versao;
    setCarregando(true); setErro('');
    try {
      const lista = await listarUsuarios();
      if (atual === controle.versao) setUsuarios(lista);
    } catch (error) {
      if (atual === controle.versao) setErro(error.message || 'Não foi possível carregar os usuários.');
    } finally {
      if (atual === controle.versao) setCarregando(false);
    }
  }, [controle]);
  useEffect(() => {
    void carregar();
    return () => { controle.versao++; };
  }, [carregar, controle]);
  useEffect(() => {
    if (form && !dialog.current.open) dialog.current.showModal();
  }, [form]);
  useEffect(() => {
    if (exclusao && !dialogExcluir.current.open) dialogExcluir.current.showModal();
  }, [exclusao]);

  async function confirmarExclusao() {
    if (excluindo || !exclusao || exclusao.id === usuarioId || nomeConfirmacao !== exclusao.nome) return;
    setExcluindo(true); setErroExclusao('');
    try {
      await excluirUsuario(exclusao.id);
      setExclusao(null);
      setAviso('Usuário excluído com sucesso.');
      await carregar();
    } catch (error) { setErroExclusao(error.message || 'Não foi possível excluir o usuário.'); }
    finally { setExcluindo(false); }
  }

  function abrir(dados) { setErroForm(''); setAviso(''); setForm(dados); }
  async function salvar(event) {
    event.preventDefault();
    if (salvando) return;
    setErroForm(''); setSalvando(true);
    try {
      await salvarUsuario(form.id
        ? { acao: 'editar', id: form.id, nome: form.nome.trim(), perfil: form.perfil, ativo: form.ativo }
        : { ...form, nome: form.nome.trim(), email: form.email.trim(), acao: 'criar' });
      setForm(null);
      setAviso(form.id ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso. A conta já pode entrar se estiver ativa.');
      await carregar();
    } catch (error) { setErroForm(error.message || 'Não foi possível salvar o usuário.'); }
    finally { setSalvando(false); }
  }
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const filtrados = usuarios.filter(item =>
    `${item.nome} ${item.email || ''}`.toLocaleLowerCase('pt-BR').includes(termo) &&
    (filtro === 'todos' || item.perfil === filtro || (filtro === 'inativos' && !item.ativo)));
  const propriaConta = form?.id === usuarioId;

  return <section className="usuarios" aria-label="Gestão de usuários">
    <div className="usuarios-indicadores">
      {[
        ['Total de usuários', usuarios.length],
        ['Motoristas', usuarios.filter(u => u.perfil === 'motorista').length],
        ['Administradores', usuarios.filter(u => u.perfil === 'administrador').length],
        ['Contas ativas', usuarios.filter(u => u.ativo).length],
      ].map(([titulo, valor]) => <div className="usuarios-card" key={titulo}><span>{titulo}</span><strong>{carregando || erro ? '—' : valor}</strong></div>)}
    </div>
    <div className="usuarios-barra">
      <input aria-label="Buscar por nome ou e-mail" placeholder="Buscar por nome ou e-mail..." value={busca} onChange={e => setBusca(e.target.value)} />
      <select aria-label="Filtrar usuários" value={filtro} onChange={e => setFiltro(e.target.value)}>
        <option value="todos">Todos os usuários</option><option value="motorista">Motoristas</option>
        <option value="administrador">Administradores</option><option value="inativos">Contas inativas</option>
      </select>
      <button disabled={carregando} onClick={carregar}>Atualizar</button>
      <button className="usuarios-primary" onClick={() => abrir(novoCadastro())}>+ Novo usuário</button>
    </div>
    {aviso && <p className="usuarios-sucesso" role="status">{aviso}</p>}
    {erro && <p className="usuarios-erro" role="alert">{erro} Use Atualizar para tentar novamente.</p>}
    <div className="usuarios-tabela"><table>
      <thead><tr><th>Nome</th><th>E-mail</th><th>Permissão</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>
        {carregando ? <tr><td colSpan="5" role="status">Carregando usuários...</td></tr> : erro ? <tr><td colSpan="5">Listagem indisponível.</td></tr> : filtrados.map(item => <tr key={item.id}>
          <td><strong>{item.nome}</strong>{item.id === usuarioId && <small> Sua conta</small>}</td>
          <td>{item.email || '—'}</td><td>{item.perfil === 'administrador' ? 'Administrador' : 'Motorista'}</td>
          <td><span className={`usuarios-badge ${item.ativo ? 'ativo' : ''}`}>{item.ativo ? 'Ativa' : 'Inativa'}</span></td>
          <td><div className="usuarios-acoes-linha"><button aria-label={`Editar ${item.nome}`} onClick={() => abrir({ ...item })}>Editar</button>
            <button className="usuarios-danger" aria-label={`Excluir ${item.nome}`} disabled={item.id === usuarioId}
              title={item.id === usuarioId ? 'Você não pode excluir sua própria conta.' : 'Excluir usuário'}
              onClick={() => { setErroExclusao(''); setNomeConfirmacao(''); setAviso(''); setExclusao(item); }}>Excluir</button></div></td>
        </tr>)}
        {!carregando && !erro && !filtrados.length && <tr><td colSpan="5">Nenhum usuário encontrado.</td></tr>}
      </tbody>
    </table></div>
    <p className="usuarios-ajuda">Motoristas usam o aplicativo da frota. Administradores também têm acesso ao painel. Contas inativas não podem acessar os dados.</p>
    {exclusao && <dialog ref={dialogExcluir} className="usuarios-dialog" aria-labelledby="excluir-titulo" aria-describedby="excluir-descricao"
      onCancel={event => { if (excluindo) event.preventDefault(); else setExclusao(null); }}>
      <h2 id="excluir-titulo">Excluir usuário?</h2>
      <p id="excluir-descricao">A conta será excluída permanentemente e perderá o acesso ao sistema. Esta ação não pode ser desfeita.</p>
      <div className="usuarios-identidade"><strong>{exclusao.nome}</strong><span>{exclusao.email}</span></div>
      <p className="usuarios-ajuda">Os registros de viagens, checklists e despesas serão preservados.</p>
      <label>Digite o nome completo para confirmar
        <input autoComplete="off" spellCheck={false} disabled={excluindo} value={nomeConfirmacao}
          onChange={event => setNomeConfirmacao(event.target.value)} aria-describedby="excluir-nome-ajuda" />
      </label>
      <small id="excluir-nome-ajuda">Digite exatamente: {exclusao.nome}</small>
      {erroExclusao && <p className="usuarios-erro" role="alert">{erroExclusao}</p>}
      <div className="usuarios-acoes">
        <button autoFocus disabled={excluindo} onClick={() => setExclusao(null)}>Cancelar</button>
        <button className="usuarios-danger" disabled={excluindo || nomeConfirmacao !== exclusao.nome} onClick={confirmarExclusao}>{excluindo ? 'Excluindo...' : 'Confirmar exclusão'}</button>
      </div>
    </dialog>}
    {form && <dialog ref={dialog} className="usuarios-dialog" aria-labelledby="usuario-titulo" onCancel={event => { if (salvando) event.preventDefault(); else setForm(null); }}>
      <h2 id="usuario-titulo">{form.id ? 'Editar usuário' : 'Novo usuário'}</h2>
      <p>Defina os dados e a permissão de acesso.</p>
      <form onSubmit={salvar}>
        <fieldset disabled={salvando}>
          <label>Nome completo<input autoFocus required maxLength={150} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} autoComplete="name" /></label>
          <label>E-mail<input type="email" required maxLength={254} readOnly={Boolean(form.id)} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="off" /></label>
          {form.id ? <small>O e-mail identifica a conta e não é alterado nesta tela.</small> : <label>Senha inicial<input type="password" required minLength={8} maxLength={128} value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} autoComplete="new-password" /><small>Entre 8 e 128 caracteres. A conta será criada com e-mail confirmado.</small></label>}
          <label>Permissão<select aria-label="Permissão" disabled={propriaConta} value={form.perfil} onChange={e => setForm({ ...form, perfil: e.target.value })}><option value="motorista">Motorista</option><option value="administrador">Administrador</option></select></label>
          <label>Situação<select aria-label="Situação" disabled={propriaConta} value={String(form.ativo)} onChange={e => setForm({ ...form, ativo: e.target.value === 'true' })}><option value="true">Ativa</option><option value="false">Inativa</option></select></label>
          {propriaConta && <small>Para preservar seu acesso, sua própria conta deve continuar ativa e administradora.</small>}
          {form.perfil === 'administrador' && <p className="usuarios-ajuda">Administradores podem gerenciar usuários e os dados de toda a frota.</p>}
          {erroForm && <p className="usuarios-erro" role="alert">{erroForm}</p>}
          <div className="usuarios-acoes"><button type="button" onClick={() => setForm(null)}>Cancelar</button><button className="usuarios-primary" type="submit">{salvando ? 'Salvando...' : 'Salvar usuário'}</button></div>
        </fieldset>
      </form>
    </dialog>}
  </section>;
}
