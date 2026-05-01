import { Test, TestingModule } from '@nestjs/testing';
import { EmailDiscoveryService } from './email-discovery.service';
import * as dns from 'dns';
import * as net from 'net';
import { EventEmitter } from 'events';

// Mocks complets pour les modules natifs
jest.mock('dns');
jest.mock('net');

describe('EmailDiscoveryService', () => {
  let service: EmailDiscoveryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailDiscoveryService],
    }).compile();

    service = module.get<EmailDiscoveryService>(EmailDiscoveryService);
    
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('generatePermutations', () => {
    it('devrait générer 8 permutations correctes pour un prénom, nom et domaine', () => {
      const perms = service.generatePermutations('John', 'Doe', 'acme.com');
      expect(perms).toHaveLength(8);
      expect(perms).toContain('john.doe@acme.com');
      expect(perms).toContain('john@acme.com');
      expect(perms).toContain('jdoe@acme.com');
      expect(perms).toContain('j.doe@acme.com');
      expect(perms).toContain('johndoe@acme.com');
    });

    it('devrait nettoyer les caractères spéciaux et les majuscules', () => {
      const perms = service.generatePermutations(' Jöhn! ', ' D-öe ', 'acme.com');
      // "jhn" et "de" après regex remove
      expect(perms).toContain('jhn.de@acme.com');
    });
  });

  describe('getMxRecords', () => {
    it('devrait retourner la liste des serveurs MX triée par priorité', async () => {
      (dns.resolveMx as unknown as jest.Mock).mockImplementation((domain, callback) => {
        callback(null, [
          { exchange: 'alt1.aspmx.l.google.com', priority: 10 },
          { exchange: 'aspmx.l.google.com', priority: 1 },
        ]);
      });

      const records = await service.getMxRecords('google.com');
      expect(records).toEqual(['aspmx.l.google.com', 'alt1.aspmx.l.google.com']);
    });

    it('devrait retourner un tableau vide en cas d\'erreur (ex: pas de MX)', async () => {
      (dns.resolveMx as unknown as jest.Mock).mockImplementation((domain, callback) => {
        callback(new Error('ENOTFOUND'), null);
      });

      const records = await service.getMxRecords('fake-domain.com');
      expect(records).toEqual([]);
    });
  });

  describe('isCatchAll & pingSmtp', () => {
    // Helper pour simuler le comportement TCP d'un serveur SMTP
    const mockSmtpServer = (behavior: 'accept' | 'reject_user' | 'reject_early') => {
      const mockSocket = new EventEmitter() as any;
      mockSocket.write = jest.fn();
      mockSocket.end = jest.fn();
      mockSocket.destroy = jest.fn();
      mockSocket.setTimeout = jest.fn((time, cb) => {
        // Enregistrer le timeout callback si besoin
      });

      (net.createConnection as unknown as jest.Mock).mockImplementation(() => {
        // Simuler la connexion avec un délai très court
        setTimeout(() => {
          if (behavior === 'reject_early') {
            mockSocket.emit('data', Buffer.from('554 No SMTP service here\r\n'));
            return;
          }
          mockSocket.emit('data', Buffer.from('220 welcome.smtp.com\r\n'));
        }, 10);
        return mockSocket;
      });

      // Simuler les réponses en fonction de ce qui est écrit
      mockSocket.write.mockImplementation((data: string) => {
        setTimeout(() => {
          if (data.startsWith('HELO')) {
            mockSocket.emit('data', Buffer.from('250 Hello\r\n'));
          } else if (data.startsWith('MAIL FROM')) {
            mockSocket.emit('data', Buffer.from('250 OK\r\n'));
          } else if (data.startsWith('RCPT TO')) {
            if (behavior === 'accept') {
              mockSocket.emit('data', Buffer.from('250 Accepted\r\n'));
            } else if (behavior === 'reject_user') {
              mockSocket.emit('data', Buffer.from('550 User unknown\r\n'));
            }
          }
        }, 10);
      });
    };

    it('devrait détecter un serveur Catch-All (accepte un email au hasard)', async () => {
      mockSmtpServer('accept');
      const isCatchAll = await service.isCatchAll('catchall-domain.com', 'mx.catchall.com');
      expect(isCatchAll).toBe(true);
    });

    it('devrait retourner false pour un serveur non Catch-All (rejette email au hasard)', async () => {
      mockSmtpServer('reject_user');
      const isCatchAll = await service.isCatchAll('strict-domain.com', 'mx.strict.com');
      expect(isCatchAll).toBe(false);
    });

    it('devrait identifier un email valide sur un serveur non Catch-All', async () => {
      // Pour findValidEmail, on doit d'abord simuler le isCatchAll (qui va rejecter) 
      // puis simuler le ping du VRAI email qui va accepter.
      // C'est complexe avec un seul mock, testons directement `verifyEmail` avec des mocks successifs.
      
      (dns.resolveMx as unknown as jest.Mock).mockImplementation((d, cb) => cb(null, [{ exchange: 'mx.com', priority: 1 }]));
      
      let connectionCount = 0;
      (net.createConnection as unknown as jest.Mock).mockImplementation(() => {
        connectionCount++;
        const mockSocket = new EventEmitter() as any;
        mockSocket.write = jest.fn((data: string) => {
          setTimeout(() => {
            if (data.startsWith('HELO') || data.startsWith('MAIL FROM')) {
              mockSocket.emit('data', Buffer.from('250 OK\r\n'));
            } else if (data.startsWith('RCPT TO')) {
              // Première connexion: test CatchAll (doit rejecter 550)
              if (connectionCount === 1) {
                mockSocket.emit('data', Buffer.from('550 Unknown\r\n'));
              } 
              // Deuxième connexion: test du VRAI email (doit accepter 250)
              else {
                mockSocket.emit('data', Buffer.from('250 Accepted\r\n'));
              }
            }
          }, 5);
        });
        mockSocket.end = jest.fn();
        mockSocket.destroy = jest.fn();
        mockSocket.setTimeout = jest.fn();
        setTimeout(() => mockSocket.emit('data', Buffer.from('220 welcome\r\n')), 5);
        return mockSocket;
      });

      const result = await service.verifyEmail('real.user@domain.com');
      
      expect(result.isValid).toBe(true);
      expect(result.isCatchAll).toBe(false);
      expect(result.confidence).toBe(99);
    });

    it('devrait identifier un email invalide (rejeté)', async () => {
      (dns.resolveMx as unknown as jest.Mock).mockImplementation((d, cb) => cb(null, [{ exchange: 'mx.com', priority: 1 }]));
      
      mockSmtpServer('reject_user'); // Rejette tout : le catch-all ET l'email cible

      const result = await service.verifyEmail('fake.user@domain.com');
      
      expect(result.isValid).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });
});
