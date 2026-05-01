import { EmailDiscoveryService } from '../src/modules/agents/services/email-discovery.service';
import * as readline from 'readline';

async function run() {
  console.log('==============================================');
  console.log('🤖 ProspectAI - Test Live de Découverte d\'Email');
  console.log('==============================================\n');
  console.log('ATTENTION: Ce script effectue de vraies requêtes DNS et TCP (Port 25).');
  console.log('Assurez-vous que votre pare-feu/FAI ne bloque pas les requêtes SMTP sortantes.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => new Promise((resolve) => rl.question(query, resolve));

  try {
    const firstName = await question('Prénom du prospect (ex: bill): ');
    const lastName = await question('Nom du prospect (ex: gates): ');
    const domain = await question('Domaine de l\'entreprise (ex: microsoft.com): ');

    rl.close();

    if (!firstName || !lastName || !domain) {
      console.log('❌ Paramètres manquants.');
      return;
    }

    const service = new EmailDiscoveryService();

    console.log(`\n🔍 Recherche des enregistrements MX pour ${domain}...`);
    const mxRecords = await service.getMxRecords(domain);
    
    if (mxRecords.length === 0) {
      console.log(`❌ Aucun serveur MX trouvé pour ${domain}. Impossible de recevoir des emails.`);
      return;
    }
    console.log(`✅ Serveurs MX trouvés :`, mxRecords);

    console.log(`\n🕵️ Vérification si le serveur primaire (${mxRecords[0]}) est un "Catch-All"...`);
    const isCatchAll = await service.isCatchAll(domain, mxRecords[0]);
    if (isCatchAll) {
      console.log(`⚠️ Ce domaine est configuré en Catch-All (il accepte n'importe quelle adresse).`);
    } else {
      console.log(`✅ Ce domaine N'EST PAS un Catch-All (il rejette les fausses adresses).`);
    }

    console.log(`\n🚀 Lancement de la génération des permutations et du Ping SMTP...`);
    const result = await service.findValidEmail(firstName, lastName, domain);

    if (result) {
      console.log('\n🎉 SUCCÈS ! Une adresse email valide a été trouvée :');
      console.log(`   📧 Email      : ${result.email}`);
      console.log(`   💯 Confiance  : ${result.confidence}%`);
      console.log(`   🌐 Catch-All  : ${result.isCatchAll ? 'Oui' : 'Non'}`);
    } else {
      console.log('\n❌ ÉCHEC. Aucune des permutations n\'a été acceptée par le serveur SMTP.');
    }

  } catch (error: any) {
    console.error('\n🚨 Erreur inattendue:', error.message);
  } finally {
    process.exit(0);
  }
}

run();
