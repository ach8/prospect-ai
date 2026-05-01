import { Test, TestingModule } from '@nestjs/testing';
import { LeadResearchAgentService } from './research-agent.service';
import { EmailDiscoveryService } from './email-discovery.service';
import { ProspectsService } from '../../prospects/prospects.service';
import { GooglePlacesService } from './google-places.service';
import { WebScraperService } from './web-scraper.service';
import { OpenDataService } from './open-data.service';
import * as ai from 'ai';

// Mocks du SDK AI
jest.mock('ai', () => ({
  generateText: jest.fn(),
  tool: jest.fn((config) => config), // Le mock de tool retourne simplement l'objet de config
}));

jest.mock('@ai-sdk/google', () => ({
  google: jest.fn(),
}));

describe('LeadResearchAgentService', () => {
  let service: LeadResearchAgentService;
  let emailDiscoveryMock: jest.Mocked<Partial<EmailDiscoveryService>>;
  let prospectsServiceMock: jest.Mocked<Partial<ProspectsService>>;
  let googlePlacesServiceMock: jest.Mocked<Partial<GooglePlacesService>>;
  let webScraperServiceMock: jest.Mocked<Partial<WebScraperService>>;
  let openDataServiceMock: jest.Mocked<Partial<OpenDataService>>;

  beforeEach(async () => {
    emailDiscoveryMock = { findValidEmail: jest.fn() };
    prospectsServiceMock = { create: jest.fn() };
    googlePlacesServiceMock = { searchBusinesses: jest.fn() };
    webScraperServiceMock = { scrapeWebsite: jest.fn() };
    openDataServiceMock = { searchCompany: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadResearchAgentService,
        { provide: EmailDiscoveryService, useValue: emailDiscoveryMock },
        { provide: ProspectsService, useValue: prospectsServiceMock },
        { provide: GooglePlacesService, useValue: googlePlacesServiceMock },
        { provide: WebScraperService, useValue: webScraperServiceMock },
        { provide: OpenDataService, useValue: openDataServiceMock },
      ],
    }).compile();

    service = module.get<LeadResearchAgentService>(LeadResearchAgentService);
    jest.clearAllMocks();
  });

  it('devrait appeler generateText avec le prompt et retourner le résumé', async () => {
    const mockResult = {
      text: 'Voici les prospects trouvés.',
      steps: [{ type: 'text-generation' }],
    };
    (ai.generateText as jest.Mock).mockResolvedValue(mockResult);

    const result = await service.runResearch('Trouve des CTOs', 'tenant-123');

    expect(ai.generateText).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.summary).toBe('Voici les prospects trouvés.');
    expect(result.stepsTaken).toBe(1);
  });

  describe('Outils (Tools)', () => {
    let tools: any;

    beforeEach(async () => {
      // On intercepte les tools générés lors de l'appel à generateText
      (ai.generateText as jest.Mock).mockImplementation(async (config) => {
        tools = config.tools;
        return { text: 'Done', steps: [] };
      });
      await service.runResearch('Test tools', 'tenant-123');
    });

    it('discoverEmail: devrait retourner SUCCÈS si un email valide est trouvé', async () => {
      (emailDiscoveryMock.findValidEmail as jest.Mock).mockResolvedValue({
        email: 'john@acme.com',
        isValid: true,
        isCatchAll: false,
        confidence: 99,
      });

      const response = await tools.discoverEmail.execute({
        firstName: 'John',
        lastName: 'Doe',
        domain: 'acme.com',
      });

      expect(emailDiscoveryMock.findValidEmail).toHaveBeenCalledWith('John', 'Doe', 'acme.com');
      expect(response).toContain('SUCCÈS');
      expect(response).toContain('john@acme.com');
    });

    it('discoverEmail: devrait retourner ÉCHEC si aucun email n\'est trouvé', async () => {
      (emailDiscoveryMock.findValidEmail as jest.Mock).mockResolvedValue(null);

      const response = await tools.discoverEmail.execute({
        firstName: 'John',
        lastName: 'Doe',
        domain: 'acme.com',
      });

      expect(response).toContain('ÉCHEC');
    });

    it('saveProspect: devrait appeler prospectsService.create avec les bonnes données', async () => {
      const prospectData = {
        firstName: 'John',
        lastName: 'Doe',
        companyName: 'Acme',
        companyDomain: 'acme.com',
        jobTitle: 'CTO',
        email: 'john@acme.com',
        emailConfidence: 99,
      };

      await tools.saveProspect.execute(prospectData);

      expect(prospectsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...prospectData,
          source: 'AI_SEARCH',
          emailVerified: true,
        }),
        'tenant-123'
      );
    });

    it('searchLocalBusinesses: devrait appeler googlePlacesService.searchBusinesses', async () => {
      (googlePlacesServiceMock.searchBusinesses as jest.Mock).mockResolvedValue([{ name: 'Test' }]);
      const response = await tools.searchLocalBusinesses.execute({ query: 'Test', limit: 2 });
      expect(googlePlacesServiceMock.searchBusinesses).toHaveBeenCalledWith('Test', 2);
      expect(response).toContain('Test');
    });

    it('readWebsiteContent: devrait appeler webScraperService.scrapeWebsite', async () => {
      (webScraperServiceMock.scrapeWebsite as jest.Mock).mockResolvedValue('Contenu web');
      const response = await tools.readWebsiteContent.execute({ url: 'https://test.com' });
      expect(webScraperServiceMock.scrapeWebsite).toHaveBeenCalledWith('https://test.com');
      expect(response).toBe('Contenu web');
    });

    it('searchCompanyRegistry: devrait appeler openDataService.searchCompany', async () => {
      (openDataServiceMock.searchCompany as jest.Mock).mockResolvedValue([{ name: 'Acme Corp' }]);
      const response = await tools.searchCompanyRegistry.execute({ query: 'Acme Corp' });
      expect(openDataServiceMock.searchCompany).toHaveBeenCalledWith('Acme Corp');
      expect(response).toContain('Acme Corp');
    });
  });
});
