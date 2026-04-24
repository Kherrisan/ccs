const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('openai-compat manager', () => {
  let testDir;
  let originalCcsHome;
  let originalCcsDir;
  let configGenerator;
  let openAICompatManager;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-openai-compat-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_HOME = testDir;
    process.env.CCS_DIR = path.join(testDir, '.ccs');

    delete require.cache[require.resolve('../../../dist/cliproxy/config-generator')];
    delete require.cache[require.resolve('../../../dist/cliproxy/openai-compat-manager')];
    delete require.cache[require.resolve('../../../dist/utils/config-manager')];

    configGenerator = require('../../../dist/cliproxy/config-generator');
    openAICompatManager = require('../../../dist/cliproxy/openai-compat-manager');
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalCcsDir !== undefined) {
      process.env.CCS_DIR = originalCcsDir;
    } else {
      delete process.env.CCS_DIR;
    }

    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('preserves the generated header and connector entries across regeneration', () => {
    configGenerator.regenerateConfig();
    const configPath = configGenerator.getCliproxyConfigPath();
    const initialHeader = fs.readFileSync(configPath, 'utf8').split('\n')[0];

    openAICompatManager.addOpenAICompatProvider({
      name: 'mimo',
      baseUrl: 'https://api.xiaomimimo.com/v1',
      apiKey: 'sk-test',
      models: [{ name: 'mimo-v2-flash', alias: 'mimo-v2-flash' }],
    });

    const afterWrite = fs.readFileSync(configPath, 'utf8');
    assert.strictEqual(afterWrite.split('\n')[0], initialHeader, 'Should preserve the generated header');
    assert(afterWrite.includes('openai-compatibility:'), 'Should write the openai-compatibility section');
    assert.strictEqual(
      configGenerator.configNeedsRegeneration(),
      false,
      'Legacy openai-compat writes should not force regeneration'
    );

    configGenerator.regenerateConfig();

    const afterRegen = fs.readFileSync(configPath, 'utf8');
    assert(afterRegen.includes('openai-compatibility:'), 'Connector section should survive regeneration');
    assert(afterRegen.includes('name: mimo'), 'Connector name should survive regeneration');
    assert(
      afterRegen.includes('base-url: https://api.xiaomimimo.com/v1'),
      'Connector base URL should survive regeneration'
    );
  });

  it('removes the openai-compatibility section cleanly when the last legacy connector is deleted', () => {
    configGenerator.regenerateConfig();
    const configPath = configGenerator.getCliproxyConfigPath();
    const initialHeader = fs.readFileSync(configPath, 'utf8').split('\n')[0];

    openAICompatManager.addOpenAICompatProvider({
      name: 'mimo',
      baseUrl: 'https://api.xiaomimimo.com/v1',
      apiKey: 'sk-test',
      models: [{ name: 'mimo-v2-flash', alias: 'mimo-v2-flash' }],
    });

    const removed = openAICompatManager.removeOpenAICompatProvider('mimo');
    assert.strictEqual(removed, true, 'Expected the legacy connector to be removed');

    const afterRemove = fs.readFileSync(configPath, 'utf8');
    assert.strictEqual(
      afterRemove.split('\n')[0],
      initialHeader,
      'Should preserve the generated header after removing the last connector'
    );
    assert(
      !afterRemove.includes('openai-compatibility:'),
      'Should remove the openai-compatibility section when the last connector is deleted'
    );
    assert(!afterRemove.includes('name: mimo'), 'Should remove the deleted connector payload');
    assert.strictEqual(
      configGenerator.configNeedsRegeneration(),
      false,
      'Removing the last legacy connector should not force regeneration'
    );
  });
});
