# Igor-e-Bianca

Convite de casamento premium com Next.js 14, Tailwind CSS e Framer Motion.

## Banco de dados

Use um arquivo `.env.local` com a variável `DATABASE_URL` apontando para o Neon.
O arquivo `.env.example` já deixou o campo preparado para isso.
Defina também `ADMIN_PASSWORD` para acesso ao painel em `/admin/login`.

## Rodar localmente

1. Instale as dependencias.
2. Execute `npm run dev`.
3. Acesse `http://localhost:3000`.

## Painel admin

- URL de login: `/admin/login`
- A senha vem da variavel `ADMIN_PASSWORD` no `.env.local`.
- No painel `/admin`, voce pode gerar codigos e ver a lista de pessoas que acessaram o convite.
