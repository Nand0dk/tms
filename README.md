# VPS Brasil — Controle de estoque e cargas

Sistema interno para controle de estoque e cargas. A abertura tem tela de carregamento e login visual. Depois do acesso, o site abre em uma página inicial com Recebimento, Estoque e Armazém.

## Como executar

Na pasta do projeto:

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal (em geral http://localhost:5173).

Para gerar a versão de produção:

```bash
npm run build
```

## Acesso

Ao abrir o sistema, a primeira tela é a de carregamento: a logo centralizada e uma indicação curta de progresso. Depois de cerca de dois segundos, o sistema segue sozinho para a tela de login.

O login pede usuário e senha e o botão **Entrar**. Ele é apenas visual por enquanto: não há servidor, banco nem autenticação real. Qualquer usuário e qualquer senha entram, desde que os dois campos não estejam vazios. Se um campo ficar vazio, a tela mostra um aviso curto em português.

A sessão fica só na memória da página. Atualizar o navegador volta para a tela de carregamento e, em seguida, para o login. O botão **Sair**, no topo do site, encerra a sessão e retorna ao login sem repetir a animação de carregamento.

Depois de entrar, a página inicial mostra os cartões **Recebimento**, **Estoque** e **Armazém**. A lista fica só na memória desta sessão: ao atualizar a página, ela começa vazia de novo. A seta no canto superior esquerdo volta para a página inicial.

## O que já existe

- Tela de carregamento com a logo
- Tela de login (acesso visual)
- Página inicial com Recebimento, Estoque e Armazém
- Recebimento, com pesquisa de produto e inclusão de novo produto (código, nome e unidade), ainda só na memória da sessão
- Em um produto já cadastrado, a opção **Receber lote** guarda número, quantidade, validade e a quantidade de caixas. A lista mostra só o último lote. **Apagar lote** remove esse lote. Cada caixa ganha um número (CX-0001) e uma etiqueta com QR para imprimir, ainda só na memória desta sessão
- Estoque mostra o saldo e as caixas. Dá para definir a posição de uma caixa e, se houver armazém cadastrado, escolher em qual. Armazém cadastra os armazéns (código e nome) usados nessa posição. Tudo continua só na memória da sessão

Ainda não há saídas de estoque nem cargas. O site ocupa a largura da página, no celular e no desktop.

## Nome da empresa

O nome e o subtítulo ficam em um único lugar: `src/config.ts`.

Altere `company.name` e `company.subtitle` nesse arquivo. As telas de carregamento e de login, e o título da aba, usam esses valores. A logo usada na interface é o arquivo `public/logo-vps.jpg`, apontado por `company.logoSrc`.
