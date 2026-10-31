# Igor & Bianca · Convite de Casamento

Site-convite do casamento de **Igor & Bianca** (18 de abril de 2027, Pampulha – Belo Horizonte), com confirmação de presença por código, mural de mensagens dos convidados e painel administrativo.

Feito com Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion e PostgreSQL (Neon).

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Começando](#começando)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Scripts](#scripts)
- [Rotas](#rotas)
- [Personalização](#personalização)
- [Deploy](#deploy)
- [Créditos](#créditos)

## Funcionalidades

**Home (`/login`)**

- Introdução com arco de flores em camadas (efeito 3D com o mouse) e “Clique para entrar”, que também inicia a música.
- Topo com a foto do casal que encolhe ao rolar enquanto outras quatro fotos entram ao redor.
- “Nossa história” com polaroids empilhadas pela rolagem e foto ampliada ao clicar.
- Contagem regressiva com troca suave da cor de fundo e confete de flores.
- Local da cerimônia com carrossel automático de fotos do Recanto Pampulha e endereço com link para o Google Maps.
- Acesso ao convite por código.
- Mural de mensagens dos convidados em post-its, num carrossel de duas linhas que se atualiza a cada 5 segundos.
- Perguntas frequentes em sanfona, pétalas brancas a cada clique e player de música.

**Convite (`/convite`)**

- Envelope que abre com animação e revela o cartão “Igor & Bianca”.
- Confirmação de presença (RSVP): sim/não, nomes do convidado ou do casal, filhos com idade (quando o convite permite) e mensagem para os noivos com seletor de emojis.
- Uma resposta por código; depois de enviada, o convite fica bloqueado.

**Lista de presentes (`/presentes`)**

- Presentes com foto, descrição e valor; cada presente é dado por um único convidado.
- O convidado entra com o código do convite e escolhe entre enviar o valor por **Pix** (QR Code e "copia e cola" com o valor já preenchido, direto na conta dos noivos e sem taxa) ou **comprar na loja** indicada.
- Tela de agradecimento ao final. (Recados para o casal ficam só no RSVP, para quem confirma presença.)
- Presentes escolhidos aparecem como "Reservado" até os noivos confirmarem e, depois, como "Presenteado".

**Painel admin (`/admin`)**

- Login com senha, geração de códigos de convite e lista de acessos e respostas.
- Aba **Presentes**: cadastrar, ocultar e excluir presentes; ver quem presenteou; confirmar o Pix (conferindo no extrato pela referência `PRESENTE` + número do presente) ou cancelar, liberando o presente.

## Tecnologias

| Camada | Ferramentas |
| --- | --- |
| Framework | [Next.js 14](https://nextjs.org/) (App Router, Route Handlers) |
| Linguagem | TypeScript |
| Estilo | Tailwind CSS · fontes Instrument Serif, Instrument Sans, Poppins e Caveat (via `next/font`) |
| Animações | Framer Motion · Canvas · Web Animations API |
| Banco de dados | PostgreSQL ([Neon](https://neon.tech/)) com `pg` |

## Estrutura do projeto

```text
app/
  login/            Home do site (página principal)
  convite/          Envelope e formulário de RSVP
  admin/            Painel administrativo e login
  api/              Rotas de API (convite, RSVP, admin)
  layout.tsx        Fontes, introdução e player de música
components/
  home/             Seções da home (topo, história, mensagens, perguntas, efeitos)
  intro-arco.tsx    Introdução com o arco de flores
  interactive-envelope-invite.tsx   Envelope + formulário de RSVP
  site-music-player.tsx             Player de música
  emoji-picker.tsx                  Seletor de emojis do formulário
lib/                Conexão com o banco, dados do evento e autenticação do admin
db/schema.sql       Esquema do banco
scripts/            Criação das tabelas
public/
  imagens/casal/    Fotos do casal usadas na home
  imagens/convite/  Fundo do convite (jardim de rosas brancas)
  intro/arco/       Camadas da introdução
  sons/             Música do site
```

## Começando

**Pré-requisitos:** Node.js 18.17 ou superior e um banco PostgreSQL (ex.: Neon).

```bash
# 1. Clone o repositório
git clone https://github.com/IgorFialho/Igor---Bianca.git
cd Igor---Bianca

# 2. Instale as dependências
npm install

# 3. Crie o arquivo .env.local (veja "Variáveis de ambiente")

# 4. Crie as tabelas no banco
node scripts/create-db.mjs

# (Projeto já existente) só as tabelas da lista de presentes, sem dados de exemplo
node scripts/create-gifts-tables.mjs

# 5. Rode em modo de desenvolvimento
npm run dev
```

Acesse <http://localhost:3000>. A raiz `/` redireciona para a home em `/login`.

## Variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto. Ele já é ignorado pelo Git — **nunca** faça commit de credenciais.

```env
DATABASE_URL="postgresql://USUARIO:SENHA@HOST/BANCO?sslmode=require"
ADMIN_PASSWORD="uma-senha-forte"

# Lista de presentes (Pix direto na conta dos noivos)
PIX_KEY="sua-chave-aleatoria"
PIX_RECEIVER_NAME="Igor Fialho"
PIX_RECEIVER_CITY="Belo Horizonte"
```

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | Sim | String de conexão do PostgreSQL. |
| `ADMIN_PASSWORD` | Sim | Senha do painel `/admin`. Sem ela, o sistema usa uma senha padrão insegura. |
| `PIX_KEY` | Para o Pix | Chave Pix que recebe os presentes. Prefira uma **chave aleatória**: ela aparece para os convidados. |
| `PIX_RECEIVER_NAME` | Para o Pix | Nome do titular da conta (até 25 letras, sem acentos é o ideal). |
| `PIX_RECEIVER_CITY` | Para o Pix | Cidade do titular (até 15 letras). |

## Banco de dados

O esquema está em [`db/schema.sql`](db/schema.sql) e é aplicado por `node scripts/create-db.mjs`, que lê a `DATABASE_URL` do `.env.local`.

| Tabela | Conteúdo |
| --- | --- |
| `invitation_codes` | Códigos de convite e se pedem dados dos filhos. |
| `rsvp_responses` | Respostas de presença e mensagens para o casal. |
| `rsvp_children` | Nome e idade dos filhos informados no RSVP. |
| `wedding_events` | Dados do evento. |
| `gifts` | Presentes da lista (nome, descrição, foto, valor e link da loja). |
| `gift_contributions` | Quem escolheu cada presente, a forma (Pix ou loja), o recado e a situação. |

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento em `http://localhost:3000`. |
| `npm run build` | Build de produção. |
| `npm run start` | Sobe o build de produção. |
| `npm run lint` | Lint do Next.js. |

## Rotas

| Rota | Descrição |
| --- | --- |
| `/login` | Home do site (a raiz `/` redireciona para cá). |
| `/convite` | Envelope e RSVP; exige um código válido informado na home. |
| `/presentes` | Lista de presentes; exige o código do convite para presentear. |
| `/admin/login` · `/admin` | Login e painel administrativo. |
| `GET` · `POST /api/gifts` | Lista de presentes e registro de quem presenteou. |
| `GET /api/gifts/pix` | Gera o Pix (copia e cola + QR Code) com o valor do presente. |
| `/api/admin/gifts` | Cadastro, ocultar/excluir presentes e confirmação dos presentes recebidos. |
| `GET /api/rsvp?messages=yes` | Mensagens públicas deixadas pelos convidados. |
| `GET` · `POST /api/rsvp` | Consulta e envio da confirmação de presença. |
| `POST /api/invite/login` | Valida o código do convite. |
| `/api/admin/*` | Login, logout, códigos e acessos do painel. |

## Personalização

| O que mudar | Onde |
| --- | --- |
| Fotos e textos da home, capítulos da história e perguntas frequentes | Constantes no topo de [`app/login/page.tsx`](app/login/page.tsx) |
| Ponto de foco de cada foto (para não cortar rostos) | Campo `position` das fotos em `app/login/page.tsx` |
| Data, horário e local do evento | [`lib/invite.ts`](lib/invite.ts) e `EVENT_DATE` em `app/login/page.tsx` |
| Cores e fontes | [`tailwind.config.ts`](tailwind.config.ts) e [`app/layout.tsx`](app/layout.tsx) |
| Texto da introdução | [`components/intro-arco.tsx`](components/intro-arco.tsx) |

## Deploy

O projeto roda em qualquer plataforma compatível com Next.js, como a [Vercel](https://vercel.com/):

1. Importe o repositório.
2. Configure `DATABASE_URL` e `ADMIN_PASSWORD` nas variáveis de ambiente.
3. Faça o deploy — o build usa `npm run build`.

## Créditos

- Desenvolvido por [Igor Fialho](https://github.com/IgorFialho).
- Layout da home e da introdução inspirados no template “Origins” da [Cordially](https://cordially.io); as camadas do arco de flores em `public/intro/arco/` são arte da Cordially.
- Fotos do casal: acervo pessoal de Igor & Bianca.
- Fotos do local (`public/imagens/recanto/`): álbum do site oficial do [Recanto Pampulha](https://www.recantopampulha.com.br/) (fotógrafo Claudiney Campelo).
- Fundo da página de convite: foto de [Roman Odintsov](https://www.pexels.com/@roman-odintsov/) no [Pexels](https://www.pexels.com/photo/8189071/) (Licença Pexels).
