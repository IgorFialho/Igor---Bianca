"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminGifts } from '@/components/admin/admin-gifts';
import { ConfirmDialog, type ConfirmRequest } from '@/components/admin/confirm-dialog';
import { SearchField } from '@/components/admin/search-field';

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

type AdminTab = 'codes' | 'accesses' | 'gifts';

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: 'codes', label: 'Lista de convidados' },
  { id: 'accesses', label: 'Acessos ao convite' },
  { id: 'gifts', label: 'Lista de presentes' },
];

// Lembra a última aba aberta: recarregar o painel volta para ela.
const ADMIN_TAB_KEY = 'igor-bianca-admin-tab';

const INVITE_TYPES = [
  { key: 'single', label: 'Convidado' },
  { key: 'couple', label: 'Casal' },
] as const;

type AccessFilter = 'all' | 'yes' | 'no' | 'pending' | 'message';

const ACCESS_FILTERS: { id: AccessFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'yes', label: 'Aceitaram' },
  { id: 'no', label: 'Rejeitaram' },
  { id: 'pending', label: 'Sem resposta' },
  { id: 'message', label: 'Com mensagem' },
];

type CodeFilter = 'all' | 'single' | 'couple' | 'children';

const CODE_FILTERS: { id: CodeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'single', label: 'Convidados' },
  { id: 'couple', label: 'Casais' },
  { id: 'children', label: 'Exigem dados dos filhos' },
];

/** Texto sem acentos e em minúsculas, para a busca. */
function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Linhas não vazias do campo de nomes, já sem espaços nas pontas. */
function nameLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export default function AdminPage() {
  const router = useRouter();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>('codes');
  // Ação aguardando confirmação na janela (sair, gerar códigos, exigir dados dos filhos).
  const [confirmAction, setConfirmAction] = useState<ConfirmRequest | null>(null);
  const closeConfirm = useCallback(() => setConfirmAction(null), []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ADMIN_TAB_KEY);
      if (ADMIN_TABS.some((tab) => tab.id === saved)) setActiveTab(saved as AdminTab);
    } catch {
      // Sem acesso ao armazenamento: abre na primeira aba.
    }
  }, []);

  const selectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    try {
      window.localStorage.setItem(ADMIN_TAB_KEY, tab);
    } catch {
      // Ignora: lembrar a aba é só uma conveniência.
    }
  };
  const [accesses, setAccesses] = useState<AccessItem[]>([]);
  // "single": um código por linha (cada linha é um convidado); "couple": as linhas são os nomes do casal, num código só.
  const [inviteType, setInviteType] = useState<'single' | 'couple'>('single');
  const [namesText, setNamesText] = useState('');
  const [codeSearch, setCodeSearch] = useState('');
  const [codeFilter, setCodeFilter] = useState<CodeFilter>('all');
  const [accessSearch, setAccessSearch] = useState('');
  const [isGeneratingGuestList, setIsGeneratingGuestList] = useState(false);
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [husbandName, setHusbandName] = useState('');
  const [wifeName, setWifeName] = useState('');
  const [requiresChildrenDetailsDefault, setRequiresChildrenDetailsDefault] = useState(false);
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

  const handleGenerateCodes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (inviteType === 'couple') {
      const names = [husbandName.trim(), wifeName.trim()];
      if (!names[0] || !names[1]) {
        setError('Para um casal, informe o nome do homem e o da mulher.');
        return;
      }
      setConfirmAction({
        title: 'Gerar convite',
        message: (
          <>
            Gerar <strong className="text-zinc-900">1 código</strong> de convite para o casal{' '}
            <strong className="text-zinc-900">{names.join(' e ')}</strong>?
          </>
        ),
        confirmLabel: 'Gerar',
        onConfirm: () => generateCodes('couple', names),
      });
      return;
    }

    // Convidado: um código por linha.
    const names = nameLines(namesText);
    if (names.length === 0) {
      setError('Informe o nome de pelo menos um convidado.');
      return;
    }
    setConfirmAction({
      title: 'Gerar convites',
      message: (
        <>
          Gerar <strong className="text-zinc-900">{names.length === 1 ? '1 código' : `${names.length} códigos`}</strong> de convite
          {names.length > 1 ? ', um para cada convidado da lista' : <> para <strong className="text-zinc-900">{names[0]}</strong></>}?
        </>
      ),
      confirmLabel: 'Gerar',
      onConfirm: () => generateCodes('single', names),
    });
  };

  const generateCodes = async (type: 'single' | 'couple', names: string[]) => {
    setIsGenerating(true);
    setError('');
    setGeneratedInfo('');

    try {
      const response = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Casal: os nomes vão juntos em guestName (o servidor gera um código só, vinculado a todos).
        body: JSON.stringify(
          type === 'couple'
            ? { quantity: 1, guestName: names.join('\n'), guests: [], requiresChildrenDetails: requiresChildrenDetailsDefault }
            : { guestName: '', guests: names, requiresChildrenDetails: requiresChildrenDetailsDefault }
        ),
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

      setNamesText('');
      setHusbandName('');
      setWifeName('');
      setRequiresChildrenDetailsDefault(false);
      await fetchDashboard();
    } catch (generateError) {
      const message = generateError instanceof Error ? generateError.message : 'Erro inesperado.';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLogout = () => {
    setConfirmAction({
      title: 'Sair do painel',
      message: 'Deseja sair do painel administrativo? Para voltar, será preciso digitar a senha de novo.',
      confirmLabel: 'Sair',
      onConfirm: async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        router.replace('/admin/login');
      },
    });
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

  // Busca na lista de códigos: pelo código ou pelos nomes do convite, sem diferenciar acentos.
  const codeQuery = normalize(codeSearch.trim());
  const filteredCodes = codes.filter((item) => {
    // Casal = código vinculado a mais de um nome (o servidor junta os nomes com "|").
    const isCouple = (item.guest_name ?? '').includes('|');
    if (codeFilter === 'single' && isCouple) return false;
    if (codeFilter === 'couple' && !isCouple) return false;
    if (codeFilter === 'children' && !item.requires_children_details) return false;
    return !codeQuery || normalize(`${item.code} ${item.guest_name ?? ''}`).includes(codeQuery);
  });
  const isFilteringCodes = codeQuery !== '' || codeFilter !== 'all';
  const allVisibleSelected =
    filteredCodes.length > 0 && filteredCodes.every((item) => selectedCodeIds.includes(item.id));

  // "Selecionar todos" vale só para os códigos que aparecem na busca.
  const handleToggleSelectAll = () => {
    if (filteredCodes.length === 0) {
      return;
    }

    const visibleIds = filteredCodes.map((item) => item.id);

    if (allVisibleSelected) {
      setSelectedCodeIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedCodeIds((current) => Array.from(new Set([...current, ...visibleIds])));
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

  const askToggleRequiresChildrenDetails = (codeId: string, code: string, nextValue: boolean) => {
    setConfirmAction({
      title: nextValue ? 'Exigir dados dos filhos' : 'Não exigir dados dos filhos',
      message: nextValue ? (
        <>
          Exigir nome e idade dos filhos no RSVP do código <strong className="text-zinc-900">{code}</strong>?
        </>
      ) : (
        <>
          Deixar de exigir nome e idade dos filhos no RSVP do código <strong className="text-zinc-900">{code}</strong>?
        </>
      ),
      confirmLabel: nextValue ? 'Exigir' : 'Não exigir',
      onConfirm: () => handleToggleRequiresChildrenDetails(codeId, nextValue),
    });
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

  // Busca e filtro dos acessos: texto em código, nomes e mensagem; filtro pela resposta do RSVP.
  const accessQuery = normalize(accessSearch.trim());
  const filteredAccesses = accesses.filter((item) => {
    if (accessFilter === 'yes' && item.attendance !== 'yes') return false;
    if (accessFilter === 'no' && item.attendance !== 'no') return false;
    if (accessFilter === 'pending' && item.attendance) return false;
    if (accessFilter === 'message' && !item.dietary_notes) return false;
    if (!accessQuery) return true;
    return normalize(
      [item.invite_code_used, item.guest_name, item.responder_full_name, item.children_details, item.dietary_notes]
        .filter(Boolean)
        .join(' ')
    ).includes(accessQuery);
  });
  const isFilteringAccesses = accessQuery !== '' || accessFilter !== 'all';
  const visibleAccessCodes = Array.from(new Set(filteredAccesses.map((item) => item.invite_code_used)));
  const allVisibleAccessesSelected =
    visibleAccessCodes.length > 0 && visibleAccessCodes.every((code) => selectedAccessCodes.includes(code));

  // "Selecionar todos" vale só para os acessos que aparecem com a busca/filtro.
  const handleToggleSelectAllAccesses = () => {
    if (visibleAccessCodes.length === 0) {
      return;
    }

    if (allVisibleAccessesSelected) {
      setSelectedAccessCodes((current) => current.filter((code) => !visibleAccessCodes.includes(code)));
      return;
    }

    setSelectedAccessCodes((current) => Array.from(new Set([...current, ...visibleAccessCodes])));
  };

  // Baixa o PDF com quem confirmou presença (nomes completos e, quando houver, nome e idade dos filhos).
  const handleDownloadGuestList = async () => {
    setIsGeneratingGuestList(true);
    try {
      const response = await fetch('/api/admin/guest-list');

      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Nao foi possivel gerar a lista de confirmados.');
      }

      const fileName =
        response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'convidados-confirmados.pdf';
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ type: 'success', message: 'Lista de confirmados gerada.' });
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : 'Erro inesperado.';
      setNotice({ type: 'error', message });
    } finally {
      setIsGeneratingGuestList(false);
    }
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
    <main className="relative min-h-screen bg-cream px-4 py-10 text-zinc-800 sm:px-6 sm:py-14 lg:px-10">
      <section className="mx-auto w-full max-w-7xl space-y-6">
        <div className="rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8">
          {/* Em telas médias, as abas descem para a linha de baixo quando não cabem ao lado do título. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Painel administrativo</p>
              <p className="mt-2 text-sm text-zinc-700">Gerencie convidados, acessos ao convite e a lista de presentes.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <nav
                role="tablist"
                aria-label="Seções do painel"
                className="grid grid-cols-3 gap-1 rounded-[1.25rem] border border-zinc-800/10 bg-cream p-1 sm:flex sm:rounded-full"
              >
                {ADMIN_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => selectTab(tab.id)}
                    className={`rounded-2xl px-2 py-2 text-[0.68rem] font-medium uppercase leading-tight tracking-[0.1em] transition-colors sm:shrink-0 sm:whitespace-nowrap sm:rounded-full sm:px-4 sm:text-xs sm:tracking-[0.14em] ${
                      activeTab === tab.id ? 'bg-champagne-600 text-[#fff9f1] shadow-sm' : 'text-zinc-700 hover:bg-zinc-800/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5 w-full sm:w-auto"
              >
                Sair
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'codes' ? (
        <section className="rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8">
          <h2 className="font-display text-4xl leading-none text-zinc-800">Lista de convidados</h2>

          {/* No computador o card ocupa quase a altura da tela; a tabela de códigos acompanha a altura do formulário. */}
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:min-h-[max(32rem,calc(100svh-22rem))] lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:flex lg:flex-col">
            <p className="text-xs lg:flex lg:min-h-[2.375rem] lg:items-center font-medium uppercase tracking-[0.2em] text-zinc-800/70">Gerar códigos</p>

            <form className="mt-4 space-y-3 lg:flex lg:flex-1 lg:flex-col" onSubmit={handleGenerateCodes}>
              <div className="space-y-2">
                <div role="radiogroup" aria-label="Tipo de convite" className="grid grid-cols-2 gap-1 rounded-full border border-zinc-800/10 bg-cream p-1">
                  {INVITE_TYPES.map((type) => (
                    <button
                      key={type.key}
                      type="button"
                      role="radio"
                      aria-checked={inviteType === type.key}
                      onClick={() => {
                        setInviteType(type.key);
                        setError('');
                      }}
                      className={`rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] transition-colors ${
                        inviteType === type.key ? 'bg-champagne-600 text-[#fff9f1]' : 'text-zinc-700 hover:bg-zinc-800/5'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {inviteType === 'couple' ? (
                <div className="space-y-3">
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70" htmlFor="husbandName">
                        Nome do homem
                      </label>
                      <input
                        id="husbandName"
                        value={husbandName}
                        onChange={(event) => setHusbandName(event.target.value)}
                        className="w-full rounded-xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20"
                        placeholder="Ex.: Bruno Lima"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70" htmlFor="wifeName">
                        Nome da mulher
                      </label>
                      <input
                        id="wifeName"
                        value={wifeName}
                        onChange={(event) => setWifeName(event.target.value)}
                        className="w-full rounded-xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20"
                        placeholder="Ex.: Ana Lima"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600">Gera 1 código compartilhado, vinculado aos dois nomes.</p>
                </div>
              ) : (
                <div className="space-y-2 lg:flex lg:flex-1 lg:flex-col">
                  <label className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70" htmlFor="namesText">
                    Nomes dos convidados (um por linha)
                  </label>
                  <textarea
                    id="namesText"
                    rows={6}
                    value={namesText}
                    onChange={(event) => setNamesText(event.target.value)}
                    className="w-full rounded-xl lg:flex-1 border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20"
                    placeholder={'Exemplo:\nCarla Lima\nPedro Souza\nFamília Souza'}
                  />
                  <p className="text-xs text-zinc-600">Gera 1 código para cada linha.</p>
                </div>
              )}

              {/* No casal, o espaço que sobra no card fica abaixo do checkbox, e o botão vai para o rodapé. */}
              <div className={`flex items-start pt-1 ${inviteType === 'couple' ? 'lg:flex-1' : ''}`}>
                <label className="flex items-center gap-2.5 whitespace-nowrap text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={requiresChildrenDetailsDefault}
                    onChange={(event) => setRequiresChildrenDetailsDefault(event.target.checked)}
                    className="h-[1.125rem] w-[1.125rem] rounded border-zinc-300 accent-[#8a5a2b]"
                  />
                  Exigir dados dos filhos
                </label>
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="inline-flex items-center justify-center rounded-full bg-champagne-600 px-8 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 ease-[cubic-bezier(0.22,0.72,0.36,1)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 w-full"
              >
                {isGenerating ? 'Gerando...' : 'Gerar novos codigos'}
              </button>
            </form>

            {generatedInfo ? <p className="mt-3 text-xs text-olive-800">{generatedInfo}</p> : null}
            {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">
                Códigos cadastrados ({isFilteringCodes ? `${filteredCodes.length} de ${codes.length}` : codes.length})
              </p>
              <button
                type="button"
                onClick={handleBatchDeleteRequest}
                disabled={selectedCodeIds.length === 0 || isDeletingBatch || deletingCodeId !== null}
                className="inline-flex items-center justify-center rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
              >
                {isDeletingBatch ? 'Excluindo lote...' : `Excluir selecionados (${selectedCodeIds.length})`}
              </button>
            </div>
            {codes.length > 0 ? (
              <div className="mt-4">
                <SearchField
                  value={codeSearch}
                  onChange={setCodeSearch}
                  placeholder="Buscar por nome ou código"
                  label="Buscar convidado"
                  resultCount={filteredCodes.length}
                  filter={{
                    legend: 'Mostrar',
                    options: CODE_FILTERS,
                    value: codeFilter,
                    defaultValue: 'all',
                    onChange: setCodeFilter,
                  }}
                />
              </div>
            ) : null}
            {isFilteringCodes && filteredCodes.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600">
                Nenhum convidado encontrado.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setCodeSearch('');
                    setCodeFilter('all');
                  }}
                  className="underline underline-offset-2 hover:text-zinc-900"
                >
                  Limpar busca
                </button>
              </p>
            ) : null}
            <div className="mt-4 space-y-2 sm:hidden">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5 w-full"
              >
                {allVisibleSelected
                  ? 'Desmarcar todos'
                  : 'Selecionar todos'}
              </button>

              {filteredCodes.map((item) => (
                <article key={item.id} className="rounded-2xl border border-zinc-800/10 bg-cream p-4 text-sm">
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
                      className="mt-1 h-4 w-4 rounded border-zinc-300 accent-[#8a5a2b]"
                    />
                  </div>

                  <p className="mt-2 text-xs text-zinc-500">Convidado</p>
                  <p className="whitespace-pre-line text-zinc-700">{formatGuestNames(item.guest_name)}</p>

                  <label className="mt-3 flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={item.requires_children_details}
                      onChange={(event) =>
                        askToggleRequiresChildrenDetails(item.id, item.code, event.target.checked)
                      }
                      disabled={togglingChildrenCodeId === item.id || isDeletingBatch || deletingCodeId !== null}
                      className="h-4 w-4 rounded border-zinc-300 accent-[#8a5a2b]"
                    />
                    Exigir nome e idade dos filhos no RSVP
                  </label>

                  <p className="mt-2 text-xs text-zinc-500">Criado em</p>
                  <p className="text-zinc-700">{new Date(item.created_at).toLocaleString('pt-BR')}</p>

                  <button
                    type="button"
                    disabled={deletingCodeId === item.id || isDeletingBatch}
                    onClick={() => handleDeleteRequest(item.id, item.code)}
                    className="mt-4 inline-flex items-center justify-center rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 w-full"
                  >
                    {deletingCodeId === item.id ? 'Excluindo...' : 'Excluir'}
                  </button>
                </article>
              ))}
            </div>

            {/* No computador o cartão tem a mesma altura do "Gerar códigos" ao lado e a tabela ocupa o espaço
                que sobra: fica posicionada por cima dele (absolute), então nunca estica o cartão e rola por dentro
                quando há mais códigos. Em telas menores, altura limitada a ~6 códigos. */}
            <div className="relative mt-6 hidden sm:block lg:min-h-[16rem] lg:flex-1">
            <div className="max-h-[26rem] overflow-auto rounded-2xl border border-zinc-800/10 bg-cream lg:absolute lg:inset-0 lg:max-h-none">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="sticky top-0 z-10 bg-[#f6edd7] text-[0.68rem] font-medium uppercase tracking-[0.14em] text-zinc-800/70">
                  <tr>
                    <th className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos os codigos"
                        checked={allVisibleSelected}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 rounded border-zinc-300 accent-[#8a5a2b]"
                      />
                    </th>
                    <th className="px-4 py-3">Codigo</th>
                    <th className="px-4 py-3">Nome do Convite</th>
                    <th className="px-4 py-3">Filhos</th>
                    <th className="px-4 py-3">Criado em</th>
                    <th className="px-4 py-3 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((item) => (
                    <tr key={item.id} className="border-t border-zinc-800/10 text-zinc-700 transition-colors hover:bg-[#f6edd7]/50">
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar codigo ${item.code}`}
                          checked={selectedCodeIds.includes(item.id)}
                          onChange={() => handleToggleCodeSelection(item.id)}
                          disabled={isDeletingBatch || deletingCodeId !== null}
                          className="h-4 w-4 rounded border-zinc-300 accent-[#8a5a2b]"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-800">
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
                      <td className="px-4 py-3 whitespace-pre-line">{formatGuestNames(item.guest_name)}</td>
                      <td className="px-4 py-3">
                        <label className="flex items-center justify-center gap-2 text-xs text-zinc-700">
                          <input
                            type="checkbox"
                            aria-label={`Exigir dados dos filhos para ${item.code}`}
                            checked={item.requires_children_details}
                            onChange={(event) =>
                              askToggleRequiresChildrenDetails(item.id, item.code, event.target.checked)
                            }
                            disabled={
                              togglingChildrenCodeId === item.id ||
                              isDeletingBatch ||
                              deletingCodeId !== null
                            }
                            className="h-4 w-4 rounded border-zinc-300 accent-[#8a5a2b]"
                          />
                          Exigir
                        </label>
                      </td>
                      <td className="px-4 py-3">{new Date(item.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={deletingCodeId === item.id || isDeletingBatch}
                          onClick={() => handleDeleteRequest(item.id, item.code)}
                          className="rounded-full border border-rose-300 bg-rose-50 px-3.5 py-1.5 text-xs font-medium text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
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
            </div>
          </div>
          </div>
        </section>
        ) : null}

        {activeTab === 'accesses' ? (
        <section className="rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-4xl leading-none text-zinc-800">Pessoas que acessaram o convite</h2>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <button
                type="button"
                onClick={handleDownloadGuestList}
                disabled={isGeneratingGuestList}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-champagne-600 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[#fff9f1] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
                </svg>
                {isGeneratingGuestList ? 'Gerando PDF...' : 'Lista de confirmados (PDF)'}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedAccesses}
                disabled={isDeletingSelectedAccesses || isClearingAccessHistory || selectedAccessCodes.length === 0}
                className="inline-flex items-center justify-center rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
              >
                {isDeletingSelectedAccesses
                  ? 'Excluindo selecionadas...'
                  : `Excluir selecionadas (${selectedAccessCodes.length})`}
              </button>
              <button
                type="button"
                onClick={handleClearAccessHistory}
                disabled={isDeletingSelectedAccesses || isClearingAccessHistory || accesses.length === 0}
                className="inline-flex items-center justify-center rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
              >
                {isClearingAccessHistory ? 'Limpando historico...' : 'Limpar Todo o historico'}
              </button>
            </div>
          </div>

          {accesses.length > 0 ? (
            <div className="mt-6 space-y-3">
              <SearchField
                value={accessSearch}
                onChange={setAccessSearch}
                placeholder="Buscar por nome, código ou mensagem"
                label="Buscar acesso"
                resultCount={filteredAccesses.length}
                filter={{
                  legend: 'Resposta',
                  options: ACCESS_FILTERS,
                  value: accessFilter,
                  defaultValue: 'all',
                  onChange: setAccessFilter,
                }}
              />
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">
                {isFilteringAccesses ? `${filteredAccesses.length} de ${accesses.length} acessos` : `${accesses.length} acessos`}
              </p>
              {isFilteringAccesses && filteredAccesses.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  Nenhum acesso encontrado.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAccessSearch('');
                      setAccessFilter('all');
                    }}
                    className="underline underline-offset-2 hover:text-zinc-900"
                  >
                    Limpar busca
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 space-y-2 sm:hidden">
            <button
              type="button"
              onClick={handleToggleSelectAllAccesses}
              className="inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5 w-full"
            >
              {allVisibleAccessesSelected
                ? 'Desmarcar todos'
                : 'Selecionar todos'}
            </button>

            {filteredAccesses.map((item) => (
              <article key={`${item.invite_code_used}-${item.last_accessed_at}`} className="rounded-2xl border border-zinc-800/10 bg-cream p-4 text-sm">
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
                    className="mt-1 h-4 w-4 rounded border-zinc-300 accent-[#8a5a2b]"
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
                    <span className="rounded-full border border-olive-300/70 bg-olive-50 px-2.5 py-0.5 text-xs font-medium text-olive-800">Aceitou</span>
                  ) : item.attendance === 'no' ? (
                    <span className="rounded-full border border-rose-300/70 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-800">Rejeitou</span>
                  ) : (
                    <span className="rounded-full border border-zinc-800/15 bg-[#f6edd7] px-2.5 py-0.5 text-xs font-medium text-zinc-700">Sem resposta</span>
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

          <div className="mt-6 hidden max-h-[28rem] overflow-auto rounded-2xl border border-zinc-800/10 bg-cream sm:block">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 bg-[#f6edd7] text-[0.68rem] font-medium uppercase tracking-[0.14em] text-zinc-800/70">
                <tr>
                  <th className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os acessos"
                      checked={allVisibleAccessesSelected}
                      onChange={handleToggleSelectAllAccesses}
                      className="h-4 w-4 rounded border-zinc-300 accent-[#8a5a2b]"
                    />
                  </th>
                  <th className="px-4 py-3">Codigo</th>
                  <th className="px-4 py-3">Nome do convite</th>
                  <th className="px-4 py-3">Nome do convidado</th>
                  <th className="px-4 py-3">Respostas</th>
                  <th className="px-4 py-3">Mensagem / Justificativa</th>
                  <th className="px-4 py-3">Acessos</th>
                  <th className="px-4 py-3">Ultimo acesso</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccesses.map((item) => (
                  <tr key={`${item.invite_code_used}-${item.last_accessed_at}`} className="border-t border-zinc-800/10 text-zinc-700 transition-colors hover:bg-[#f6edd7]/50">
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar acesso ${item.invite_code_used}`}
                        checked={selectedAccessCodes.includes(item.invite_code_used)}
                        onChange={() => handleToggleAccessSelection(item.invite_code_used)}
                        disabled={isDeletingSelectedAccesses || isClearingAccessHistory}
                        className="h-4 w-4 rounded border-zinc-300 accent-[#8a5a2b]"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-800">
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
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openResponderDialog(item, 'Nome dos convidados')}
                        className="max-w-[220px] truncate text-left text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900"
                        title="Clique para ver nomes e filhos"
                      >
                        {formatGuestNamesInline(item.responder_full_name)}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {item.attendance === 'yes' ? (
                        <span className="rounded-full border border-olive-300/70 bg-olive-50 px-2.5 py-0.5 text-xs font-medium text-olive-800">Aceitou</span>
                      ) : item.attendance === 'no' ? (
                        <span className="rounded-full border border-rose-300/70 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-800">Rejeitou</span>
                      ) : (
                        <span className="rounded-full border border-zinc-800/15 bg-[#f6edd7] px-2.5 py-0.5 text-xs font-medium text-zinc-700">Sem resposta</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
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
                    <td className="px-4 py-3">{item.access_count}</td>
                    <td className="px-4 py-3">{new Date(item.last_accessed_at).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!isLoading && accesses.length === 0 ? (
              <p className="p-3 text-sm text-zinc-600">Nenhum acesso registrado ainda.</p>
            ) : null}
          </div>
        </section>
        ) : null}

        {activeTab === 'gifts' ? <AdminGifts /> : null}
      </section>

      <ConfirmDialog request={confirmAction} onClose={closeConfirm} />

      {deleteDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm">
          <div className="w-full rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-2xl sm:p-8 max-w-md">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Confirmar exclusao</p>
            <h3 className="mt-2 font-display text-4xl italic leading-none text-zinc-800">
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
                className="inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCode}
                className="inline-flex items-center justify-center rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Excluir codigo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {nameDialog ? (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm">
          <div className="w-full rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-2xl sm:p-8 max-w-lg">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">{nameDialog.title}</p>

            <div className="mt-4 max-h-[45vh] overflow-auto rounded-2xl border border-zinc-800/10 bg-cream p-5">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Pais (nome)</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">{nameDialog.text}</p>
            </div>
            
            <div className="mt-4 max-h-[45vh] overflow-auto rounded-2xl border border-zinc-800/10 bg-cream p-5">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Filhos (nome e idade)</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">{nameDialog.childrenText}</p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setNameDialog(null)}
                className="inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {messageDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm">
          <div className="w-full rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-2xl sm:p-8 max-w-lg">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Mensagem completa</p>
            <h3 className="mt-2 whitespace-pre-line font-display text-4xl italic leading-none text-zinc-800">{formatGuestNames(messageDialog.guestName)}</h3>
            <p className="mt-1 text-xs text-zinc-600">Codigo: {messageDialog.code}</p>

            <div className="mt-4 max-h-[45vh] overflow-auto rounded-2xl border border-zinc-800/10 bg-cream p-5">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">{messageDialog.text}</p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setMessageDialog(null)}
                className="inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accessActionDialog ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm">
          <div className="w-full rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-2xl sm:p-8 max-w-md">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Confirmar exclusao</p>
            <h3 className="mt-2 font-display text-4xl italic leading-none text-zinc-800">
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
                className="inline-flex items-center justify-center rounded-full border border-zinc-800/20 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:bg-zinc-800/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAccessAction}
                disabled={isDeletingSelectedAccesses || isClearingAccessHistory}
                className="inline-flex items-center justify-center rounded-full border border-rose-300 bg-rose-50 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-rose-800 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
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
            className={`rounded-2xl border p-4 shadow-lg backdrop-blur ${
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
                className="rounded-full border border-current/20 px-3 py-0.5 text-xs hover:bg-white/50"
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
