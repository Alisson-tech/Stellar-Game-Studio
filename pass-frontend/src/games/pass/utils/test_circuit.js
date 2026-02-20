import { UltraHonkBackend } from '@aztec/bb.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    // Caminhos para os arquivos gerados (ajuste se necessário)
    const circuitPath = path.resolve(__dirname, '../../../../../contracts/pass/target/pass_circuit.json');
    const proofPath = path.resolve(__dirname, '../../../../../contracts/pass/target/proo/proof');
    const publicInputsPath = path.resolve(__dirname, '../../../../../contracts/pass/target/proo/public_inputs');
    const vkPath = path.resolve(__dirname, '../../../../../contracts/pass/target/vk/vk');

    try {
        console.log("📂 Carregando arquivos...");
        const circuitData = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
        const proof = fs.readFileSync(proofPath);
        const publicInputsBuffer = fs.readFileSync(publicInputsPath);

        // O Noir/Barretenberg usa Fields de 32 bytes. 
        // Vamos fatiar o buffer de public_inputs em blocos de 32 bytes.
        const publicInputs = [];
        for (let i = 0; i < publicInputsBuffer.length; i += 32) {
            const field = publicInputsBuffer.slice(i, i + 32);
            // Convertemos para Hex string com prefixo 0x, que é o que o bb.js espera
            publicInputs.push(`0x${field.toString('hex')}`);
        }

        console.log(`📊 Total de Public Inputs detectados: ${publicInputs.length}`);
        console.log("⚙️  Inicializando Backend UltraHonk...");
        const backend = new UltraHonkBackend(circuitData.bytecode);

        console.log("🔍 Verificando prova...");
        const isValid = await backend.verifyProof({
            proof: proof,
            publicInputs: publicInputs
        });
        console.log("proof", proof.length);

        if (isValid) {

        console.log("--- DEBUG PARA CONTRATO ---");
        publicInputs.forEach((input, i) => {
            // Remove o '0x' e mostra os 32 bytes hex
            const hex = input.replace('0x', '').padStart(64, '0');
            console.log(`Input [${i}] (Field): ${hex}`);
        });

        // 1. Verifique o tamanho exato da VK que o JS usa
        const vkBuffer = fs.readFileSync(vkPath);
        console.log("Tamanho da VK no JS:", vkBuffer.length);
        console.log("Primeiros 8 bytes da VK no JS:", vkBuffer.slice(0, 8).toString('hex'));

        // 2. Verifique o buffer exato de Public Inputs que o JS gera
        // O backend.verifyProof aceita strings, mas internamente ele cria um buffer.
        // Vamos simular o que o contrato deveria receber:
        const manualPublicInputsBuffer = Buffer.alloc(7 * 32);
        publicInputs.forEach((input, i) => {
            const val = BigInt(input);
            const buf = Buffer.from(val.toString(16).padStart(64, '0'), 'hex');
            buf.copy(manualPublicInputsBuffer, i * 32);
        });
        console.log("Public Inputs Buffer (Hex total):", manualPublicInputsBuffer.toString('hex'));

        // Verifique especificamente o Hash
        console.log("Hash esperado no Rust:", publicInputs[3]);
            console.log("✅ SUCESSO: A prova é matematicamente válida!");
        } else {
            console.warn("❌ FALHA: A prova é matematicamente INVÁLIDA.");
        }
    } catch (err) {
        console.error("💥 Erro durante a execução:", err.message);
    }
    process.exit(0);
}

main();
