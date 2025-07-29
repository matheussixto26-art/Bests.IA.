// api/automate.js
import axios from 'axios';

// Função para decodificar um token JWT
function decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    // Usando Buffer, que é o padrão no Node.js
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonPayload);
}

export default async function handler(request, response) {
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

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Ocp-Apim-Subscription-Key': OCP_APIM_SUBSCRIPTION_KEY,
            'User-Agent': 'Vercel-Serverless-Function/Axios'
        };

        // --- ETAPA 1: Login na SED com Axios ---
        const loginPayload = { Usuario: usuario_sed, Senha: senha, disp: "" };
        const loginResponse = await axios.post(
            "https://sedintegracoes.educacao.sp.gov.br/credenciais/api/LoginCompletoToken",
            loginPayload,
            { headers }
        );

        const sedToken = loginResponse.data.accessToken;
        if (!sedToken) {
            return response.status(401).json({ error: `Falha no login da SED: Token não retornado.` });
        }

        // --- ETAPA 2: Decodificar token e obter código do aluno ---
        const decodedToken = decodeJwt(sedToken);
        const codigoAluno = decodedToken?.CD_USUARIO;

        if (!codigoAluno) {
            return response.status(500).json({ error: 'Não foi possível extrair o Código do Aluno do token da SED.' });
        }

        // --- ETAPA 3: Buscar Turmas com Axios ---
        const turmasUrl = `https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`;
        const turmasResponse = await axios.get(turmasUrl, { headers });

        // --- SUCESSO ---
        return response.status(200).json(turmasResponse.data);

    } catch (error) {
        // Log detalhado do erro no servidor da Vercel
        console.error("ERRO DETALHADO:", error);

        // Se o erro for do axios, a resposta do servidor de destino estará em error.response
        if (error.response) {
            console.error("DADOS DO ERRO DA API EXTERNA:", error.response.data);
            return response.status(error.response.status || 500).json({
                error: 'Erro da API da SED.',
                details: error.response.data
            });
        }
        
        // Outros erros
        return response.status(500).json({ error: 'Ocorreu um erro inesperado no servidor.', details: error.message });
    }
}

