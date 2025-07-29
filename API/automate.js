// api/automate.js

// Função para decodificar um token JWT (sem verificar a assinatura)
function decodeJwt(token) {
    // O 'atob' está disponível nos runtimes da Vercel
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

// O handler principal da nossa função serverless
export default async function handler(request, response) {
    // Permitir apenas requisições POST
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).end(`Method ${request.method} Not Allowed`);
    }

    try {
        const { ra, digito, senha } = request.body;

        if (!ra || !senha) {
            return response.status(400).json({ error: 'RA e Senha são obrigatórios.' });
        }

        const OCP_APIM_SUBSCRIPTION_KEY = '5936fddda3484fe1aa4436df1bd76dab';
        const usuario_sed = `${ra}${digito || ''}SP`;

        // --- ETAPA 1: Login na SED ---
        const loginResponse = await fetch("https://sedintegracoes.educacao.sp.gov.br/credenciais/api/LoginCompletoToken", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Ocp-Apim-Subscription-Key': OCP_APIM_SUBSCRIPTION_KEY,
                'User-Agent': 'Vercel-Serverless-Function'
            },
            body: JSON.stringify({ Usuario: usuario_sed, Senha: senha, disp: "" })
        });

        const loginData = await loginResponse.json();
        if (!loginResponse.ok || !loginData.accessToken) {
            return response.status(loginResponse.status).json({ error: `Falha no login da SED: ${loginData.message || 'Credenciais inválidas ou erro no servidor da SED.'}` });
        }
        
        const sedToken = loginData.accessToken;

        // --- ETAPA 2: Decodificar token e obter código do aluno ---
        const decodedToken = decodeJwt(sedToken);
        const codigoAluno = decodedToken?.CD_USUARIO;

        if (!codigoAluno) {
            return response.status(500).json({ error: 'Não foi possível extrair o Código do Aluno do token da SED.' });
        }

        // --- ETAPA 3: Buscar Turmas ---
        const turmasUrl = `https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`;
        
        const turmasResponse = await fetch(turmasUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Ocp-Apim-Subscription-Key': OCP_APIM_SUBSCRIPTION_KEY,
                'User-Agent': 'Vercel-Serverless-Function'
            }
        });

        const turmasData = await turmasResponse.json();
        if (!turmasResponse.ok) {
             return response.status(turmasResponse.status).json({ error: `Falha ao buscar turmas: ${turmasData.message || 'Erro no servidor da SED.'}` });
        }

        // --- SUCESSO ---
        // Retorna os dados das turmas para o frontend
        return response.status(200).json(turmasData);

    } catch (error) {
        console.error("Erro interno na função serverless:", error);
        return response.status(500).json({ error: 'Ocorreu um erro inesperado no servidor.' });
    }
}

          
