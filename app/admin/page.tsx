"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type InviteCode = {
  id: string;
  code: string;
  guest_name: string | null;
  requires_children_details: boolean;
  is_active: boolean;
  created_at: string;
};

type AccessItem = {
  invite_code_used: string;
  guest_name: string | null;
  responder_full_name: string | null;
  children_details: string | null;
  access_count: number;
  last_accessed_at: string;
  attendance: 'yes' | 'no' | null;
  dietary_notes: string | null;
};

type DeleteDialogState = {
  mode: 'single' | 'batch';
  ids: string[];
  labels: string[];
} | null;

type NoticeState = {
  type: 'success' | 'error';
  message: string;
} | null;

type MessageDialogState = {
  code: string;
  guestName: string | null;
  text: string;
} | null;

type NameDialogState = {
  title: string;
  text: string;
  childrenText: string;
} | null;

type AccessActionDialogState = {
  mode: 'selected' | 'all';
  inviteCodes: string[];
} | null;

export default function AdminPage() {
  const router = useRouter();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [accesses, setAccesses] = useState<AccessItem[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestListText, setGuestListText] = useState('');
  const [requiresChildrenDetailsDefault, setRequiresChildrenDetailsDefault] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [generatedInfo, setGeneratedInfo] = useState('');
  const [deletingCodeId, setDeletingCodeId] = useState<string | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [togglingChildrenCodeId, setTogglingChildrenCodeId] = useState<string | null>(null);
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [messageDialog, setMessageDialog] = useState<MessageDialogState>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [accessActionDialog, setAccessActionDialog] = useState<AccessActionDialogState>(null);
  const [isClearingAccessHistory, setIsClearingAccessHistory] = useState(false);
  const [isDeletingSelectedAccesses, setIsDeletingSelectedAccesses] = useState(false);
  const [selectedAccessCodes, setSelectedAccessCodes] = useState<string[]>([]);

  const fetchDashboard = async () => {
    const [codesResponse, accessesResponse] = await Promise.all([
      fetch('/api/admin/codes'),
      fetch('/api/admin/accesses'),
    ]);

    if (codesResponse.status === 401 || accessesResponse.status === 401) {
      router.replace('/admin/login');
      return;
    }

    if (!codesResponse.ok || !accessesResponse.ok) {
      throw new Error('Falha ao carregar dados do painel.');
    }

    const codesData = await codesResponse.json();
    const accessesData = await accessesResponse.json();

    const nextCodes: InviteCode[] = codesData.codes || [];
    const nextIds = new Set(nextCodes.map((item) => item.id));
    const nextAccesses: AccessItem[] = accessesData.accesses || [];
    const nextAccessCodes = new Set(nextAccesses.map((item) => item.invite_code_used.toUpperCase()));

    setCodes(nextCodes);
    setSelectedCodeIds((previous) => previous.filter((id) => nextIds.has(id)));
    setAccesses(nextAccesses);
    setSelectedAccessCodes((previous) => previous.filter((code) => nextAccessCodes.has(code.toUpperCase())));
  };

  useEffect(() => {
    const run = async () => {
      try {
        await fetchDashboard();
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Erro inesperado.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [router]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const handleGenerateCodes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsGenerating(true);
    setError('');
    setGeneratedInfo('');

    const guests = guestListText
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const normalizedGuestName = guestName
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join('\n');

    try {
      const response = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity,
          guestName: normalizedGuestName,
          guests,
          requiresChildrenDetails: requiresChildrenDetailsDefault,
        }),
      });

      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Nao foi possivel gerar os codigos.');
      }

      if (data.mode === 'by_guests') {
        setGeneratedInfo(`Codigos gerados para ${data.generated.length} convidados.`);
      } else if (data.mode === 'single_linked_names') {
        setGeneratedInfo('Codigo unico gerado e vinculado aos nomes informados.');
      } else {
        setGeneratedInfo(`Codigos gerados: ${data.generated.length} de ${data.requested}.`);
      }

      setGuestName('');
      setGuestListText('');
      setRequiresChildrenDetailsDefault(false);
      await fetchDashboard();
    } catch (generateError) {
      const message = generateError instanceof Error ? generateError.message : 'Erro inesperado.';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
  };

  const handleCopyCode = async (code: string, label: string) => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard indisponivel neste navegador.');
      }

      await navigator.clipboard.writeText(code);
      setNotice({ type: 'success', message: `${label} copiado: ${code}` });
    } catch {
      setNotice({ type: 'error', message: `Nao foi possivel copiar ${label.toLowerCase()}.` });
    }
  };

  const handleDeleteRequest = (codeId: string, codeLabel: string) => {
    setDeleteDialog({ mode: 'single', ids: [codeId], labels: [codeLabel] });
  };

  const handleBatchDeleteRequest = () => {
    const selectedLabels = codes
      .filter((item) => selectedCodeIds.includes(item.id))
      .map((item) => item.code);

    if (selectedLabels.length === 0) {
      return;
    }

    setDeleteDialog({
      mode: 'batch',
      ids: selectedCodeIds,
      labels: selectedLabels,
    });
  };

  const handleToggleCodeSelection = (codeId: string) => {
    setSelectedCodeIds((previous) =>
      previous.includes(codeId)
        ? previous.filter((id) => id !== codeId)
        : [...previous, codeId]
    );
  };

  const handleToggleSelectAll = () => {
    if (codes.length === 0) {
      return;
    }

    if (selectedCodeIds.length === codes.length) {
      setSelectedCodeIds([]);
      return;
    }

    setSelectedCodeIds(codes.map((item) => item.id));
  };

  const handleDeleteCode = async () => {
    if (!deleteDialog) {
      return;
    }

    const ids = deleteDialog.ids;
    const labels = deleteDialog.labels;
    const isBatch = deleteDialog.mode === 'batch';
    const codeId = ids[0];
    const codeLabel = labels[0];

    setDeleteDialog(null);
    if (isBatch) {
      setIsDeletingBatch(true);
    } else {
      setDeletingCodeId(codeId);
    }
    setError('');
    setGeneratedInfo('');

    try {
      const response = await fetch('/api/admin/codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isBatch ? { ids } : { id: codeId }),
      });

      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Nao foi possivel excluir o codigo.');
      }

      const deletedIds = isBatch
        ? (Array.isArray(data?.deleted) ? data.deleted.map((item: InviteCode) => item.id) : ids)
        : [codeId];

      setCodes((previous) => previous.filter((item) => !deletedIds.includes(item.id)));
      setSelectedCodeIds((previous) => previous.filter((id) => !deletedIds.includes(id)));

      if (isBatch) {
        setGeneratedInfo(`${deletedIds.length} codigos excluidos com sucesso.`);
        setNotice({ type: 'success', message: `${deletedIds.length} codigos excluidos com sucesso.` });
      } else {
        setGeneratedInfo(`Codigo ${codeLabel} excluido com sucesso.`);
        setNotice({ type: 'success', message: `Codigo ${codeLabel} excluido com sucesso.` });
      }
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Erro inesperado.';
      setError(message);
      setNotice({ type: 'error', message });
    } finally {
      setDeletingCodeId(null);
      setIsDeletingBatch(false);
    }
  };

  const handleToggleRequiresChildrenDetails = async (codeId: string, nextValue: boolean) => {
    setError('');
    setGeneratedInfo('');
    setTogglingChildrenCodeId(codeId);

    const previousCodes = codes;
    setCodes((previous) =>
      previous.map((item) =>
        item.id === codeId ? { ...item, requires_children_details: nextValue } : item
      )
    );

    try {
      const response = await fetch('/api/admin/codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: codeId, requiresChildrenDetails: nextValue }),
      });

      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Nao foi possivel atualizar o codigo.');
      }

      const updatedCode: InviteCode | undefined = data?.updated;
      if (updatedCode) {
        setCodes((previous) =>
          previous.map((item) => (item.id === codeId ? { ...item, ...updatedCode } : item))
        );
      }
    } catch (toggleError) {
      setCodes(previousCodes);
      const message = toggleError instanceof Error ? toggleError.message : 'Erro inesperado.';
      setError(message);
      setNotice({ type: 'error', message });
    } finally {
      setTogglingChildrenCodeId(null);
    }
  };

  const handleClearAccessHistory = () => {
    if (accesses.length === 0) {
      return;
    }

    setAccessActionDialog({ mode: 'all', inviteCodes: [] });
  };

  const clearAllAccessHistory = async () => {
    setAccessActionDialog(null);

    setIsClearingAccessHistory(true);
    setError('');

    try {
      const response = await fetch('/api/admin/accesses', { method: 'DELETE' });

      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Nao foi possivel limpar o historico de acessos e respostas.');
      }

      setAccesses([]);
      setSelectedAccessCodes([]);
      setNotice({ type: 'success', message: 'Historico de acessos e respostas limpo com sucesso.' });
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : 'Erro inesperado.';
      setError(message);
      setNotice({ type: 'error', message });
    } finally {
      setIsClearingAccessHistory(false);
    }
  };

  const handleToggleAccessSelection = (inviteCodeUsed: string) => {
    setSelectedAccessCodes((previous) =>
      previous.includes(inviteCodeUsed)
        ? previous.filter((code) => code !== inviteCodeUsed)
        : [...previous, inviteCodeUsed]
    );
  };

  const handleToggleSelectAllAccesses = () => {
    if (accesses.length === 0) {
      return;
    }

    const allCodes = Array.from(new Set(accesses.map((item) => item.invite_code_used)));

    if (selectedAccessCodes.length === allCodes.length) {
      setSelectedAccessCodes([]);
      return;
    }

    setSelectedAccessCodes(allCodes);
  };

  const handleDeleteSelectedAccesses = () => {
    if (selectedAccessCodes.length === 0) {
      return;
    }

    setAccessActionDialog({ mode: 'selected', inviteCodes: selectedAccessCodes });
  };

  const deleteSelectedAccesses = async (inviteCodes: string[]) => {
    setAccessActionDialog(null);

    setIsDeletingSelectedAccesses(true);
    setError('');

    try {
      const response = await fetch('/api/admin/accesses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCodes }),
      });

      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Nao foi possivel excluir os acessos selecionados.');
      }

      const deletedCodes: string[] = Array.isArray(data?.deletedCodes)
        ? data.deletedCodes
        : inviteCodes;
      const deletedCodeSet = new Set(deletedCodes.map((code) => code.toUpperCase()));

      setAccesses((previous) =>
        previous.filter((item) => !deletedCodeSet.has(item.invite_code_used.toUpperCase()))
      );
      setSelectedAccessCodes([]);
      setNotice({
        type: 'success',
        message: `${deletedCodeSet.size} acesso(s) selecionado(s) excluido(s) com sucesso.`,
      });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Erro inesperado.';
      setError(message);
      setNotice({ type: 'error', message });
    } finally {
      setIsDeletingSelectedAccesses(false);
    }
  };

  const handleConfirmAccessAction = async () => {
    if (!accessActionDialog) {
      return;
    }

    if (accessActionDialog.mode === 'selected') {
      await deleteSelectedAccesses(accessActionDialog.inviteCodes);
      return;
    }

    await clearAllAccessHistory();
  };

  const uniqueAccessCodes = Array.from(new Set(accesses.map((item) => item.invite_code_used)));

  const formatGuestNames = (rawValue: string | null) => {
    if (!rawValue) {
      return 'Sem nome';
    }

    const names = rawValue
      .split('|')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (names.length === 0) {
      return 'Sem nome';
    }

    return names.join('\n');
  };

  const hasCoupleNames = (rawValue: string | null) => {
    if (!rawValue) {
      return false;
    }

    return rawValue
      .split('|')
      .map((item) => item.trim())
      .filter((item) => item.length > 0).length > 1;
  };

  const formatGuestNamesInline = (rawValue: string | null) => {
    if (!rawValue) {
      return 'Sem nome';
    }

    const names = rawValue
      .split('|')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (names.length === 0) {
      return 'Sem nome';
    }

    return names.join(' | ');
  };

  const formatChildrenDetails = (rawValue: string | null) => {
    if (!rawValue) {
      return 'Sem filhos informados';
    }

    const children = rawValue
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (children.length === 0) {
      return 'Sem filhos informados';
    }

    return children.join('\n');
  };

  const openResponderDialog = (item: AccessItem, title: string) => {
    setNameDialog({
      title,
      text: formatGuestNames(item.responder_full_name),
      childrenText: formatChildrenDetails(item.children_details),
    });
  };

  return (
    <main className="paper-texture relative min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <section className="mx-auto w-full max-w-7xl space-y-4">
        <div className="frosted-light gold-frame rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.34em] text-zinc-600">Painel administrativo</p>
              <h1 className="font-display text-3xl text-champagne-800 sm:text-4xl">Igor-e-Bianca</h1>
              <p className="text-sm text-zinc-700">Gerencie codigos de acesso e acompanhe quem ja entrou no convite.</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full rounded-lg border border-zinc-300 bg-white/75 px-4 py-2 text-sm text-zinc-700 hover:bg-white sm:w-auto"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="frosted-light gold-frame rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-3xl text-champagne-800">Gerar codigos</h2>

            <form className="mt-4 space-y-3" onSubmit={handleGenerateCodes}>
              <div className="space-y-2">
                <label className="text-sm text-zinc-700" htmlFor="guestListText">
                  Nome da pessoa ou casal (um por linha)
                </label>
                <textarea
                  id="guestListText"
                  rows={6}
                  value={guestListText}
                  onChange={(event) => setGuestListText(event.target.value)}
                  className="focus-gold w-full rounded-lg border border-zinc-200/90 bg-white/85 px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-500"
                  placeholder={"Exemplo:\nJoao e Maria\nFamilia Souza\nCarla Lima"}
                />
              </div>

              <p className="text-xs text-zinc-600">
                Se preencher os nomes acima, o sistema gera 1 codigo para cada linha.
              </p>

              <p className="text-xs text-zinc-600">
                No campo abaixo, voce pode informar varios nomes (um por linha) para gerar um unico codigo compartilhado.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <textarea
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  rows={4}
                  className="focus-gold w-full rounded-lg border border-zinc-200/90 bg-white/85 px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-500"
                  placeholder={"Nomes vinculados ao codigo unico (opcional)\nExemplo:\nAna Lima\nBruno Lima"}
                />
                <label className="flex items-center gap-2 whitespace-nowrap text-xs text-zinc-700">
                  <input
                    type="checkbox"
                    checked={requiresChildrenDetailsDefault}
                    onChange={(event) => setRequiresChildrenDetailsDefault(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Exigir dados dos filhos
                </label>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-zinc-700" htmlFor="quantity">Quantidade</label>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  max={50}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value || 1))}
                  className="focus-gold w-24 rounded-lg border border-zinc-200/90 bg-white/85 px-2 py-2 text-sm text-zinc-800"
                />
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="shimmer-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-900 disabled:opacity-70"
              >
                {isGenerating ? 'Gerando...' : 'Gerar novos codigos'}
              </button>
            </form>

            {generatedInfo ? <p className="mt-3 text-xs text-olive-800">{generatedInfo}</p> : null}
            {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
          </section>

          <section className="frosted-light gold-frame rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-3xl text-champagne-800">Codigos cadastrados</h2>
              <button
                type="button"
                onClick={handleBatchDeleteRequest}
                disabled={selectedCodeIds.length === 0 || isDeletingBatch || deletingCodeId !== null}
                className="w-full rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isDeletingBatch ? 'Excluindo lote...' : `Excluir selecionados (${selectedCodeIds.length})`}
              </button>
            </div>
            <div className="mt-4 space-y-2 sm:hidden">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="w-full rounded-lg border border-zinc-300 bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700"
              >
                {codes.length > 0 && selectedCodeIds.length === codes.length
                  ? 'Desmarcar todos'
                  : 'Selecionar todos'}
              </button>

              {codes.map((item) => (
                <article key={item.id} className="rounded-lg border border-white/70 bg-white/75 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-500">Codigo</p>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(item.code, 'Codigo')}
                        className="font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-2"
                        title="Clique para copiar o codigo"
                        aria-label={`Copiar codigo ${item.code}`}
                      >
                        {item.code}
                      </button>
                    </div>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar codigo ${item.code}`}
                      checked={selectedCodeIds.includes(item.id)}
                      onChange={() => handleToggleCodeSelection(item.id)}
                      disabled={isDeletingBatch || deletingCodeId !== null}
                      className="mt-1 h-4 w-4 rounded border-zinc-300"
                    />
                  </div>

                  <p className="mt-2 text-xs text-zinc-500">Convidado</p>
                  <p className="whitespace-pre-line text-zinc-700">{formatGuestNames(item.guest_name)}</p>

                  <label className="mt-3 flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={item.requires_children_details}
                      onChange={(event) =>
                        handleToggleRequiresChildrenDetails(item.id, event.target.checked)
                      }
                      disabled={togglingChildrenCodeId === item.id || isDeletingBatch || deletingCodeId !== null}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    Exigir nome e idade dos filhos no RSVP
                  </label>

                  <p className="mt-2 text-xs text-zinc-500">Criado em</p>
                  <p className="text-zinc-700">{new Date(item.created_at).toLocaleString('pt-BR')}</p>

                  <button
                    type="button"
                    disabled={deletingCodeId === item.id || isDeletingBatch}
                    onClick={() => handleDeleteRequest(item.id, item.code)}
                    className="mt-3 w-full rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingCodeId === item.id ? 'Excluindo...' : 'Excluir'}
                  </button>
                </article>
              ))}
            </div>

            <div className="mt-4 hidden max-h-72 overflow-auto rounded-lg border border-white/70 bg-white/65 sm:block">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-white/80 text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos os codigos"
                        checked={codes.length > 0 && selectedCodeIds.length === codes.length}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                    </th>
                    <th className="px-3 py-2">Codigo</th>
                    <th className="px-3 py-2">Nome do Convite</th>
                    <th className="px-3 py-2">Filhos</th>
                    <th className="px-3 py-2">Criado em</th>
                    <th className="px-3 py-2 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((item) => (
                    <tr key={item.id} className="border-t border-white/70 text-zinc-700">
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar codigo ${item.code}`}
                          checked={selectedCodeIds.includes(item.id)}
                          onChange={() => handleToggleCodeSelection(item.id)}
                          disabled={isDeletingBatch || deletingCodeId !== null}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-zinc-800">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(item.code, 'Codigo')}
                          className="cursor-copy underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950"
                          title="Clique para copiar o codigo"
                          aria-label={`Copiar codigo ${item.code}`}
                        >
                          {item.code}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-pre-line">{formatGuestNames(item.guest_name)}</td>
                      <td className="px-3 py-2">
                        <label className="flex items-center justify-center gap-2 text-xs text-zinc-700">
                          <input
                            type="checkbox"
                            aria-label={`Exigir dados dos filhos para ${item.code}`}
                            checked={item.requires_children_details}
                            onChange={(event) =>
                              handleToggleRequiresChildrenDetails(item.id, event.target.checked)
                            }
                            disabled={
                              togglingChildrenCodeId === item.id ||
                              isDeletingBatch ||
                              deletingCodeId !== null
                            }
                            className="h-4 w-4 rounded border-zinc-300"
                          />
                          Exigir
                        </label>
                      </td>
                      <td className="px-3 py-2">{new Date(item.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={deletingCodeId === item.id || isDeletingBatch}
                          onClick={() => handleDeleteRequest(item.id, item.code)}
                          className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingCodeId === item.id ? 'Excluindo...' : 'Excluir'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!isLoading && codes.length === 0 ? (
                <p className="p-3 text-sm text-zinc-600">Nenhum codigo cadastrado.</p>
              ) : null}
            </div>
          </section>
        </div>

        <section className="frosted-light gold-frame rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl text-champagne-800">Pessoas que acessaram o convite</h2>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <button
                type="button"
                onClick={handleDeleteSelectedAccesses}
                disabled={isDeletingSelectedAccesses || isClearingAccessHistory || selectedAccessCodes.length === 0}
                className="w-full rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isDeletingSelectedAccesses
                  ? 'Excluindo selecionadas...'
                  : `Excluir selecionadas (${selectedAccessCodes.length})`}
              </button>
              <button
                type="button"
                onClick={handleClearAccessHistory}
                disabled={isDeletingSelectedAccesses || isClearingAccessHistory || accesses.length === 0}
                className="w-full rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isClearingAccessHistory ? 'Limpando historico...' : 'Limpar Todo o historico'}
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-2 sm:hidden">
            <button
              type="button"
              onClick={handleToggleSelectAllAccesses}
              className="w-full rounded-lg border border-zinc-300 bg-white/80 px-3 py-2 text-xs font-medium text-zinc-700"
            >
              {uniqueAccessCodes.length > 0 && selectedAccessCodes.length === uniqueAccessCodes.length
                ? 'Desmarcar todos'
                : 'Selecionar todos'}
            </button>

            {accesses.map((item) => (
              <article key={`${item.invite_code_used}-${item.last_accessed_at}`} className="rounded-lg border border-white/70 bg-white/75 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-zinc-500">Codigo</p>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(item.invite_code_used, 'Codigo')}
                      className="font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-2"
                      title="Clique para copiar o codigo"
                      aria-label={`Copiar codigo ${item.invite_code_used}`}
                    >
                      {item.invite_code_used}
                    </button>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar acesso ${item.invite_code_used}`}
                    checked={selectedAccessCodes.includes(item.invite_code_used)}
                    onChange={() => handleToggleAccessSelection(item.invite_code_used)}
                    disabled={isDeletingSelectedAccesses || isClearingAccessHistory}
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                </div>

                <p className="mt-2 text-xs text-zinc-500">Nome do convite</p>
                {hasCoupleNames(item.guest_name) ? (
                  <span
                    className="mt-1 block max-w-full truncate text-left text-zinc-700 underline decoration-zinc-300 underline-offset-2"
                    title={formatGuestNamesInline(item.guest_name)}
                  >
                    {formatGuestNamesInline(item.guest_name)}
                  </span>
                ) : (
                  <p className="whitespace-pre-line text-zinc-700">{formatGuestNames(item.guest_name)}</p>
                )}

                <p className="mt-2 text-xs text-zinc-500">Nome do casal</p>
                <button
                  type="button"
                  onClick={() => openResponderDialog(item, 'Nome do casal')}
                  className="mt-1 max-w-full truncate text-left text-zinc-700 underline decoration-zinc-300 underline-offset-2"
                  title="Clique para ver nomes e filhos"
                >
                  {formatGuestNamesInline(item.responder_full_name)}
                </button>

                <p className="mt-2 text-xs text-zinc-500">Resposta</p>
                <div className="mt-1">
                  {item.attendance === 'yes' ? (
                    <span className="rounded-full border border-olive-300 bg-olive-50 px-2 py-0.5 text-xs font-semibold text-olive-800">Aceitou</span>
                  ) : item.attendance === 'no' ? (
                    <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">Rejeitou</span>
                  ) : (
                    <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">Sem resposta</span>
                  )}
                </div>

                <p className="mt-2 text-xs text-zinc-500">Mensagem / Justificativa</p>
                {item.dietary_notes ? (
                  <button
                    type="button"
                    onClick={() =>
                      setMessageDialog({
                        code: item.invite_code_used,
                        guestName: item.guest_name,
                        text: item.dietary_notes as string,
                      })
                    }
                    className="mt-1 max-w-full truncate text-left text-zinc-700 underline decoration-zinc-300 underline-offset-2"
                    title="Clique para ler completo"
                  >
                    {item.dietary_notes.length > 13
                      ? `${item.dietary_notes.slice(0, 13)}...`
                      : item.dietary_notes}
                  </button>
                ) : (
                  <p className="mt-1 text-zinc-500">Sem mensagem</p>
                )}

                <p className="mt-2 text-xs text-zinc-500">Acessos</p>
                <p className="text-zinc-700">{item.access_count}</p>

                <p className="mt-2 text-xs text-zinc-500">Ultimo acesso</p>
                <p className="text-zinc-700">{new Date(item.last_accessed_at).toLocaleString('pt-BR')}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 hidden max-h-80 overflow-auto rounded-lg border border-white/70 bg-white/65 sm:block">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-white/80 text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os acessos"
                      checked={uniqueAccessCodes.length > 0 && selectedAccessCodes.length === uniqueAccessCodes.length}
                      onChange={handleToggleSelectAllAccesses}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                  </th>
                  <th className="px-3 py-2">Codigo</th>
                  <th className="px-3 py-2">Nome do convite</th>
                  <th className="px-3 py-2">Nome do convidado</th>
                  <th className="px-3 py-2">Respostas</th>
                  <th className="px-3 py-2">Mensagem / Justificativa</th>
                  <th className="px-3 py-2">Acessos</th>
                  <th className="px-3 py-2">Ultimo acesso</th>
                </tr>
              </thead>
              <tbody>
                {accesses.map((item) => (
                  <tr key={`${item.invite_code_used}-${item.last_accessed_at}`} className="border-t border-white/70 text-zinc-700">
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar acesso ${item.invite_code_used}`}
                        checked={selectedAccessCodes.includes(item.invite_code_used)}
                        onChange={() => handleToggleAccessSelection(item.invite_code_used)}
                        disabled={isDeletingSelectedAccesses || isClearingAccessHistory}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-zinc-800">
                      <button
                        type="button"
                        onClick={() => handleCopyCode(item.invite_code_used, 'Codigo')}
                        className="cursor-copy underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950"
                        title="Clique para copiar o codigo"
                        aria-label={`Copiar codigo ${item.invite_code_used}`}
                      >
                        {item.invite_code_used}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {hasCoupleNames(item.guest_name) ? (
                        <span
                          className="block max-w-[220px] truncate text-left text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
                          title={formatGuestNamesInline(item.guest_name)}
                        >
                          {formatGuestNamesInline(item.guest_name)}
                        </span>
                      ) : (
                        <span className="whitespace-pre-line">{formatGuestNames(item.guest_name)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openResponderDialog(item, 'Nome dos convidados')}
                        className="max-w-[220px] truncate text-left text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
                        title="Clique para ver nomes e filhos"
                      >
                        {formatGuestNamesInline(item.responder_full_name)}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {item.attendance === 'yes' ? (
                        <span className="rounded-full border border-olive-300 bg-olive-50 px-2 py-0.5 text-xs font-semibold text-olive-800">Aceitou</span>
                      ) : item.attendance === 'no' ? (
                        <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">Rejeitou</span>
                      ) : (
                        <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">Sem resposta</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {item.dietary_notes ? (
                        <button
                          type="button"
                          onClick={() =>
                            setMessageDialog({
                              code: item.invite_code_used,
                              guestName: item.guest_name,
                              text: item.dietary_notes as string,
                            })
                          }
                          className="max-w-[300px] truncate text-left text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
                          title="Clique para ler completo"
                        >
                          {item.dietary_notes.length > 13
                            ? `${item.dietary_notes.slice(0, 13)}...`
                            : item.dietary_notes}
                        </button>
                      ) : (
                        <span className="text-zinc-500">Sem mensagem</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{item.access_count}</td>
                    <td className="px-3 py-2">{new Date(item.last_accessed_at).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!isLoading && accesses.length === 0 ? (
              <p className="p-3 text-sm text-zinc-600">Nenhum acesso registrado ainda.</p>
            ) : null}
          </div>
        </section>
      </section>

      {deleteDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 px-4">
          <div className="frosted-light gold-frame w-full max-w-md rounded-2xl p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-600">Confirmar exclusao</p>
            <h3 className="mt-1 font-display text-3xl text-champagne-800">
              {deleteDialog.mode === 'batch' ? 'Excluir codigos em lote' : 'Excluir codigo'}
            </h3>
            <p className="mt-3 text-sm text-zinc-700">
              {deleteDialog.mode === 'batch' ? (
                <>
                  Tem certeza que deseja excluir <span className="font-semibold text-zinc-900">{deleteDialog.labels.length} codigos</span>? Esta acao nao pode ser desfeita.
                </>
              ) : (
                <>
                  Tem certeza que deseja excluir o codigo <span className="font-semibold text-zinc-900">{deleteDialog.labels[0]}</span>? Esta acao nao pode ser desfeita.
                </>
              )}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                className="rounded-lg border border-zinc-300 bg-white/80 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCode}
                className="rounded-lg border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-200"
              >
                Excluir codigo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {nameDialog ? (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-zinc-950/35 px-4">
          <div className="frosted-light gold-frame w-full max-w-lg rounded-2xl p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-600">{nameDialog.title}</p>

            <div className="mt-4 max-h-[45vh] overflow-auto rounded-lg border border-white/70 bg-white/75 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Pais (nome)</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">{nameDialog.text}</p>
            </div>
            
            <div className="mt-4 max-h-[45vh] overflow-auto rounded-lg border border-white/70 bg-white/75 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Filhos (nome e idade)</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">{nameDialog.childrenText}</p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setNameDialog(null)}
                className="rounded-lg border border-zinc-300 bg-white/80 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {messageDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/35 px-4">
          <div className="frosted-light gold-frame w-full max-w-lg rounded-2xl p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-600">Mensagem completa</p>
            <h3 className="mt-1 whitespace-pre-line font-display text-3xl text-champagne-800">{formatGuestNames(messageDialog.guestName)}</h3>
            <p className="mt-1 text-xs text-zinc-600">Codigo: {messageDialog.code}</p>

            <div className="mt-4 max-h-[45vh] overflow-auto rounded-lg border border-white/70 bg-white/75 p-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">{messageDialog.text}</p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setMessageDialog(null)}
                className="rounded-lg border border-zinc-300 bg-white/80 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accessActionDialog ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-zinc-950/35 px-4">
          <div className="frosted-light gold-frame w-full max-w-md rounded-2xl p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-600">Confirmar exclusao</p>
            <h3 className="mt-1 font-display text-3xl text-champagne-800">
              {accessActionDialog.mode === 'selected' ? 'Excluir acessos selecionados' : 'Limpar historico em lote'}
            </h3>
            <p className="mt-3 text-sm text-zinc-700">
              {accessActionDialog.mode === 'selected' ? (
                <>
                  Tem certeza que deseja excluir{' '}
                  <span className="font-semibold text-zinc-900">{accessActionDialog.inviteCodes.length} acesso(s) selecionado(s)</span>{' '}
                  e suas respostas? Esta acao nao pode ser desfeita.
                </>
              ) : (
                <>
                  Tem certeza que deseja limpar todo o <span className="font-semibold text-zinc-900">historico de acessos e respostas</span>? Esta acao nao pode ser desfeita.
                </>
              )}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAccessActionDialog(null)}
                className="rounded-lg border border-zinc-300 bg-white/80 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAccessAction}
                disabled={isDeletingSelectedAccesses || isClearingAccessHistory}
                className="rounded-lg border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirmar exclusao
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="fixed left-4 right-4 top-4 z-[60] w-auto sm:left-auto sm:w-[min(92vw,380px)]">
          <div
            className={`gold-frame rounded-xl border p-4 shadow-lg backdrop-blur ${
              notice.type === 'success'
                ? 'border-olive-300 bg-olive-50/95 text-olive-900'
                : 'border-rose-300 bg-rose-50/95 text-rose-900'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{notice.message}</p>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="rounded-md border border-current/20 px-2 py-0.5 text-xs hover:bg-white/50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
