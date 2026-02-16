import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import fs from 'fs';

async function generate() {
    try {
        // 1. Carrega o circuito que você já tem
        const circuitData = JSON.parse(fs.readFileSync('./pass-frontend/src/games/pass/circuit.json', 'utf8'));
        
        console.log("⏳ Gerando VK... Isso pode levar alguns segundos.");
        
        // 2. Inicializa o backend
        const backend = new BarretenbergBackend(circuitData);
        
        // 3. Extrai a chave de verificação
        const vk = await backend.getVerificationKey();
        
        // 4. Salva no formato que o seu deploy.ts já entende
        circuitData.verification_key = Buffer.from(vk).toString('base64');
        
        fs.writeFileSync('./pass-frontend/src/games/pass/circuit.json', JSON.stringify(circuitData, null, 2));
        
        console.log("✅ SUCESSO: VK injetada no circuit.json!");
        process.exit(0);
    } catch (e) {
        console.error("❌ Erro:", e);
        process.exit(1);
    }
}

generate();