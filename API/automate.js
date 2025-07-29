// api/automate.js
import axios from 'axios';

// Função para decodificar um token JWT
function decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonPayload);
}

export default async function handler(request, response) {
    // --- CORREÇÃO APLICADA AQUI ---
    // Habilita o CORS para permitir chamadas de qualquer origem (como o executor da conversa)
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Ocp-Apim-Subscription-Key');

    // O navegador envia uma requisição "preflight" OPTIONS antes do POST.
    // Se for um OPTIONS, apenas retornamos OK.
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    // --- FIM DA CORREÇÃO ---


    if (request.method !== 'POST') {
        return response.status(405).end(`Method ${request.method} Not Allowed`);
    }

    try {
        const { ra, digito, senha } = request.body;

        if (!ra || !senha) {
            return response.status(400).json({ error: 'RA e Senha são obrigatórios.' });
        }

        const OCP_APIM_SUBSCRIPTION_KEY = '2b03c1db3884488795f79c37c069381a';
        const raFormatado = ra.padStart(12, '0');
        const usuario_sed = `${raFormatado}${digito || ''}sp`;

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Ocp-Apim-Subscription-Key': OCP_APIM_SUBSCRIPTION_KEY,
            'User-Agent': 'Vercel-Serverless-Function/Axios',
            'x-api-realm': 'edusp',
            'x-api-platform': 'webclient'
        };

        const loginPayload = { user: usuario_sed, senha: senha };

        // ETAPA 1: Login na SED
        const loginResponse = await axios.post(
            "https://sedintegracoes.educacao.sp.gov.br/credenciais/api/LoginCompletoToken",
            loginPayload,
            { headers }
        );

        const sedToken = loginResponse.data.accessToken;
        if (!sedToken) {
            return response.status(401).json({ error: `Falha no login da SED: Token não retornado.` });
        }

        // ETAPA 2: Decodificar token
        const decodedToken = decodeJwt(sedToken);
        const codigoAluno = decodedToken?.CD_USUARIO;

        if (!codigoAluno) {
            return response.status(500).json({ error: 'Não foi possível extrair o Código do Aluno do token da SED.' });
        }

        // ETAPA 3: Buscar Turmas
        const turmasUrl = `https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`;
        const turmasResponse = await axios.get(turmasUrl, { headers });

        // SUCESSO
        return response.status(200).json(turmasResponse.data);

    } catch (error) {
        console.error("ERRO DETALHADO:", error);

        if (error.response) {
            console.error("DADOS DO ERRO DA API EXTERNA:", error.response.data);
            return response.status(error.response.status || 500).json({
                error: 'Erro retornado pela API da SED. Verifique suas credenciais.',
                details: error.response.data
            });
        }
        
        return response.status(500).json({ error: 'Ocorreu um erro inesperado no nosso servidor.', details: error.message });
    }
}

