# celotexEDU

Mural colaborativo para compartilhar textos e links da aula. Cada turma usa uma sigla exclusiva, que também é o endereço e o código de entrada do mural. Não há cadastro de alunos: quem tem o endereço ou a sigla pode ler e contribuir.

O serviço é gratuito atualmente. O código original do celotexEDU é oferecido sob licença dupla GNU GPLv2 ou GNU GPLv3, à escolha de quem recebe o código. Consulte [LICENSE](LICENSE) e os textos integrais `LICENSE-GPL-2.0.txt` e `LICENSE-GPL-3.0.txt`. Conteúdos de usuários, marcas e componentes de terceiros mantêm seus próprios direitos e licenças. Os [Termos de Uso](https://celotex.cucandoti.com.br/termos-de-uso) explicam o escopo.

## Stack

- React e Vite para a interface responsiva.
- Node.js e Express para servir o app e validar as contribuições.
- InsForge/PostgreSQL para persistir turmas e publicações.
- Um servidor Node em uma única instância, vinculado ao gateway privado do Docker para receber o proxy HTTPS sem abrir a porta publicamente.

## Desenvolvimento

```bash
npm install
npm run dev
```

O Vite fica em `http://127.0.0.1:5173` e encaminha `/api` para o servidor em `http://127.0.0.1:4180`.

Para rodar a API fora do modo desenvolvimento, copie `.env.example` para `.env` e informe `INSFORGE_URL` e `INSFORGE_API_KEY`. Em uma pasta vinculada com a InsForge CLI, o servidor também pode usar o arquivo local ignorado `.insforge/project.json`. A chave administrativa é lida apenas pelo Node; nunca a exponha em variável `VITE_*`.

## Banco de dados

O projeto usa `public.boards` e `public.board_posts`, criadas pela migração em `migrations/`. RLS fica habilitado e o acesso direto dos papéis anônimo e autenticado é revogado. A aplicação acessa o banco pelo servidor Node usando a chave administrativa, que não chega ao navegador.

Para aplicar migrações no projeto InsForge vinculado:

```bash
npx -y @insforge/cli db migrations up --all
```

## Comportamento

- A sigla é única, entre 2 e 16 caracteres, e forma o endereço `/m/<sigla>`.
- Para entrar é obrigatório informar um apelido. O servidor remove acentos, converte para minúsculas e reserva o apelido dentro daquele mural; outro mural pode usar o mesmo apelido.
- O navegador guarda o apelido e uma chave de participação por mural. Ao reabrir o endereço ou voltar pelo código da sala no mesmo navegador, o servidor valida a chave e restaura apelido e papel sem pedir nova entrada. O banco armazena somente o hash da chave. Se os dados do navegador forem apagados ou a pessoa trocar de aparelho, será necessário registrar outro apelido, pois os nomes continuam reservados.
- Cada mural tem um único participante com papel de professor. O primeiro a se registrar selecionando esse papel pode apagar qualquer cartão e limpar o mural; a pessoa autora pode apagar seus próprios cartões.
- A escolha do papel de professor não é verificada por conta escolar ou senha. A opção deve ser usada pelo docente; para murais que exigem controle de acesso mais forte, é necessário adicionar uma credencial privada de professor.
- Qualquer participante pode arrastar os cartões por alça com mouse ou toque; a ordem é salva no banco e compartilhada com toda a sala. A chegada e a mudança de posição têm animação, respeitando a opção de movimento reduzido do dispositivo.
- O cabeçalho informa o total e o apelido/data da última contribuição.
- Cartões têm altura uniforme; textos longos abrem em leitura completa, e URLs são quebradas para caber em telas pequenas.
- A página consulta a atividade do mural a cada 10 segundos enquanto está visível e só busca a lista quando há atualização.
- As listas retornam no máximo 100 itens; a tela apresenta até 60 cartões que podem ser ordenados.
- As anotações aceitam até 20.000 caracteres; observações de links continuam limitadas a 500. O servidor limita o tamanho das requisições e a frequência de criação de murais e publicações.
- Não são aceitos HTML, uploads ou scripts; as anotações são exibidas como texto.

Como os murais são públicos para quem tem a sigla, compartilhe o código somente com a turma. Não publique informações pessoais ou sensíveis. A aplicação não possui contas de aluno, edição de cartões ou verificação independente de quem assume o papel de professor.

## Verificação

```bash
npm test
npm run build
```

O teste de integração com o backend InsForge pode ser habilitado com `CELOTEX_INTEGRATION=1 npm test`; ele cria um mural temporário e o remove ao terminar.

## Publicação na VPS

O domínio é `celotex.cucandoti.com.br`. O Node escuta em `172.18.0.1:4180`, acessível ao proxy do AzuraCast pela rede Docker e sem expor a porta 4180 na interface pública. O processo usa uma única instância PM2, pois essa versão não mantém estado de sessão no Node.

Após instalar dependências e gerar o build, inicie o processo:

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
curl http://172.18.0.1:4180/api/health
```

O painel do AzuraCast gerencia o certificado Let's Encrypt. O virtual host em `deploy/celotex.nginx.conf` encaminha o host HTTPS para `http://172.18.0.1:4180` e mantém o desafio ACME disponível em HTTP. Na VPS, essa configuração fica em `/var/azuracast/celotex.nginx.conf` e é montada pelo `docker-compose.override.yml` do AzuraCast em `/etc/nginx/sites-enabled/zz-celotex.vhost`.

Após atualizar o virtual host, valide e recarregue apenas o Nginx dentro do container `azuracast`:

```bash
sudo docker exec azuracast nginx -t
sudo docker exec azuracast nginx -s reload
```

O certificado foi validado e o domínio responde pela aplicação. A alteração do virtual host foi recarregada sem reiniciar o container; o bind mount no override mantém o arquivo disponível em futuras recriações. O certificado, os serviços de transmissão e as portas públicas do host não foram alterados por esta publicação.
