# CRM Balcão

CRM para pequenas empresas, com atendimento por WhatsApp, três níveis de login e várias empresas clientes no mesmo sistema.

| Login | O que vê | Pode criar login de |
|---|---|---|
| Administrador (você) | Todas as empresas, todos os gerentes e funcionários | Gerente e funcionário |
| Gerente | Os próprios dados e os da equipe dele | Funcionário da equipe dele |
| Funcionário | Só os próprios clientes, conversas, pedidos e lembretes (mais a fila de atendimento) | Ninguém |

Essas regras ficam gravadas no próprio banco de dados. Mesmo que alguém tente acessar por fora das telas, não enxerga o que não pode.

## Telas

- **Painel**: pedidos, atendimentos, conversas esperando resposta, taxa de resolução, tempo da primeira resposta, gráfico por dia, ranking e desempenho por pessoa. Exporta para planilha (CSV) ou PDF.
- **Chat**: conversas do WhatsApp com fotos, vídeos, áudios e documentos. Assumir da fila, transferir, encaminhar para outra área, mudar o status, etiquetas, lembretes, pedidos e ordens de serviço direto da conversa, mensagens rápidas com `/`, gravação de áudio, envio da galeria, busca, histórico, fixar, arquivar, favoritar e bloquear.
- **Chat da equipe**: conversas internas, diretas ou em grupo, com arquivos e mensagens favoritas.
- **Contatos**: base de clientes com filtros, etiquetas, histórico, importação e exportação de planilha.
- **Lembretes**: calendário com a agenda do dia. O sistema avisa na hora marcada.
- **Mensagens rápidas**: atalhos pessoais, como `/oi`, que viram respostas prontas no chat.
- **Pedidos**: número automático, status, forma e situação do pagamento, filtros e exportação.
- **Funil de vendas**: negócios por etapa.
- **Galeria de mídia**: pastas e arquivos, privados, da equipe ou da empresa toda.
- **Assistência**: ordens de serviço com frete e conta a pagar, e as pendências encaminhadas por outras áreas.
- **Equipe e logins**, **Etiquetas**, **Configurações** (áreas, tempo de resposta, WhatsApp), **Empresas** e **Suporte** (chamados).
- **Meu perfil**: foto, status (online, ocupado, offline), tema claro ou escuro, som, senha, verificação em duas etapas, organização do menu e tour guiado.

---

## Instalação do zero

Você vai precisar de três contas gratuitas: **Supabase** (banco e logins), **GitHub** (código) e **Vercel** (deixa o site no ar).

1. **Supabase**: crie um projeto (região São Paulo). Em **SQL Editor > New query**, cole todo o arquivo `supabase/schema.sql` e clique em **Run**. No resultado embaixo deve aparecer "Tudo certo!".
2. **Seu login**: em **Authentication > Users > Add user > Create new user**, coloque seu e-mail e uma senha só com letras e números, e marque **Auto Confirm User**. O primeiro login vira administrador.
3. **Fechar o cadastro público**: em **Authentication > Sign In / Providers**, desligue **Allow new users to sign up**.
4. **Chaves**: em **Project Settings > Data API** copie o **Project URL** (só até `.supabase.co`). Em **API Keys > Legacy API keys** copie a **anon public** e a **service_role**.
5. **Vercel**: importe o repositório e cadastre as variáveis:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | o Project URL |
| `SUPABASE_ANON_KEY` | a chave anon / public |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave service_role (secreta) |

## Atualizar uma instalação antiga

Cole de novo o arquivo `supabase/schema.sql` inteiro no **SQL Editor** e clique em **Run**. Ele só acrescenta o que falta e não apaga dados. Pode rodar quantas vezes precisar.

---

## Conectar o WhatsApp (API oficial da Meta)

Faça isso quando fechar com a empresa cliente. Cada empresa usa um número próprio, que **não pode** estar sendo usado no aplicativo WhatsApp comum ao mesmo tempo.

**O que a empresa cliente precisa ter:** um Gerenciador de Negócios da Meta (business.facebook.com), de preferência verificado, um número de telefone para o atendimento e uma forma de pagamento cadastrada na Meta. A Meta cobra por conversa iniciada pela empresa (modelos). As respostas a clientes que chamaram primeiro, dentro de 24 horas, são gratuitas ou bem mais baratas.

**Uma vez só (no seu projeto):**
1. Em developers.facebook.com, crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
2. Na Vercel, cadastre mais duas variáveis e faça um novo Deploy:
   - `WHATSAPP_VERIFY_TOKEN`: uma senha que você inventa (ex.: `balcao-2026-xyz`).
   - `WHATSAPP_APP_SECRET`: em **Configurações do app > Básico > Chave secreta do aplicativo**.
3. No app, em **WhatsApp > Configuração > Webhook**, coloque:
   - URL de retorno: `https://SEU-SITE.vercel.app/api/whatsapp` (aparece pronto em **Configurações** no CRM, com botão Copiar)
   - Token de verificação: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
   - Depois, assine o campo **messages**.

**Para cada empresa cliente:**
1. Adicione e verifique o número da empresa em **WhatsApp > Configuração da API**.
2. Em **business.facebook.com > Usuários do sistema**, crie um usuário do sistema com acesso à conta do WhatsApp e gere um **token permanente** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
3. No CRM, entre como administrador, escolha a empresa, vá em **Configurações > Conectar WhatsApp** e informe o **ID do número de telefone**, o **ID da conta do WhatsApp Business** e o **token**. O CRM confere com a Meta antes de salvar.

**Regras importantes do WhatsApp:**
- Depois de 24 horas sem mensagem do cliente, só dá para mandar **modelos aprovados** (criados no Gerenciador do WhatsApp). O chat avisa e tem o botão **Enviar modelo**.
- Limites de tamanho: imagem 5 MB, vídeo e áudio 16 MB, documento 100 MB.

Enquanto o WhatsApp não está conectado, o chat funciona em modo de teste: as mensagens enviadas ficam só no CRM, e gerentes e o administrador podem **simular mensagem do cliente** pelo menu ⋮ da conversa.

---

## Dúvidas comuns

- **Alguém esqueceu a senha:** o gerente (para a equipe dele) ou o administrador abre **Editar** no login da pessoa e coloca uma senha nova.
- **Alguém saiu da empresa:** abra **Editar** no login e desmarque **Login ativo**. A pessoa perde o acesso na hora e os dados continuam lá.
- **Passar contatos de quem saiu:** no **Chat** ou em **Contatos**, use **Transferir**.
- **Encaminhar para a Assistência:** no chat, menu ⋮ > **Encaminhar para área**. Quem é da área Assistência (em **Equipe e logins**) vê a pendência e assume.
