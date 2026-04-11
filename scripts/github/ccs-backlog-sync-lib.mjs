const REQUIRED_PROJECT_FIELDS = ['Status', 'Priority', 'Follow-up', 'Next review'];
const DEFAULT_REPO_FULL_NAME = 'kaitranntt/ccs';
const DEFAULT_CLOSED_LOOKBACK_DAYS = 14;
const PRIORITY_FOR = { bug: 'P1', default: 'P2', split: 'P3' };
const FOLLOW_UP_FOR = {
  ready: 'Ready',
  repro: 'Needs repro',
  upstream: 'Blocked upstream',
  split: 'Needs split',
  docs: 'Docs follow-up',
};

const PROJECT_QUERY = `query($owner: String!, $number: Int!, $itemCursor: String) {
  user(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 50) { nodes { __typename ... on ProjectV2Field { id name } ... on ProjectV2SingleSelectField { id name options { id name } } } }
      items(first: 100, after: $itemCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id content { __typename ... on Issue { number id repository { nameWithOwner } } } }
      }
    }
  }
}`;
const ADD_ITEM_MUTATION = `mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) { item { id } }
}`;
const SET_SINGLE_SELECT_MUTATION = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId }
  }) { projectV2Item { id } }
}`;
const SET_DATE_MUTATION = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { date: $date }
  }) { projectV2Item { id } }
}`;
const CLEAR_FIELD_MUTATION = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
  clearProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $fieldId}) { projectV2Item { id } }
}`;

export function isoDate(daysFromNow, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

export function classify(labels, state, now = new Date()) {
  const names = new Set(labels.map((label) => label.name));
  const priority = names.has('bug')
    ? PRIORITY_FOR.bug
    : names.has('needs-split')
      ? PRIORITY_FOR.split
      : PRIORITY_FOR.default;
  if (state === 'closed')
    return { priority, followUp: FOLLOW_UP_FOR.ready, nextReview: null, status: 'Done' };
  if (names.has('upstream-blocked'))
    return {
      priority,
      followUp: FOLLOW_UP_FOR.upstream,
      nextReview: isoDate(7, now),
      status: 'Todo',
    };
  if (names.has('needs-repro'))
    return {
      priority,
      followUp: FOLLOW_UP_FOR.repro,
      nextReview: isoDate(14, now),
      status: 'Todo',
    };
  if (names.has('needs-split'))
    return {
      priority,
      followUp: FOLLOW_UP_FOR.split,
      nextReview: isoDate(14, now),
      status: 'Todo',
    };
  if (names.has('docs-gap'))
    return { priority, followUp: FOLLOW_UP_FOR.docs, nextReview: isoDate(7, now), status: 'Todo' };
  return { priority, followUp: FOLLOW_UP_FOR.ready, nextReview: null, status: 'Todo' };
}

export function parseRepoFullName(repoFullName = DEFAULT_REPO_FULL_NAME) {
  const [repoOwner, repoName, extra] = String(repoFullName).split('/');
  if (!repoOwner || !repoName || extra) {
    throw new Error(`Invalid GITHUB_REPOSITORY value "${repoFullName}". Expected OWNER/REPO.`);
  }
  return { repoOwner, repoName, repoFullName: `${repoOwner}/${repoName}` };
}

export function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const segment of linkHeader.split(',')) {
    const match = segment.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match?.[2] === 'next') return match[1];
  }
  return null;
}

function getHeader(headers, name) {
  if (typeof headers?.get === 'function') return headers.get(name);
  return headers?.[name] || headers?.[name.toLowerCase()] || null;
}

function buildCutoffTimestamp(now, days) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString();
}

function isRecentlyClosed(issue, now, days) {
  if (issue.state !== 'closed' || !issue.closed_at) return false;
  return Date.parse(issue.closed_at) >= Date.parse(buildCutoffTimestamp(now, days));
}

export function validateProjectFields(fields) {
  const missing = REQUIRED_PROJECT_FIELDS.filter((name) => !fields.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Missing required project field${missing.length > 1 ? 's' : ''}: ${missing.map((name) => `"${name}"`).join(', ')}`
    );
  }
  return {
    statusField: fields.get('Status'),
    priorityField: fields.get('Priority'),
    followUpField: fields.get('Follow-up'),
    nextReviewField: fields.get('Next review'),
  };
}

export async function listGithubCollection(initialPath, githubRequest) {
  const items = [];
  let nextPath = initialPath;
  while (nextPath) {
    const { body, headers } = await githubRequest(nextPath);
    if (!Array.isArray(body)) throw new Error(`Expected array response for ${nextPath}`);
    items.push(...body);
    nextPath = parseNextLink(getHeader(headers, 'link'));
  }
  return items;
}

export async function getProjectContext({ owner, projectNumber, repoFullName, graphqlRequest }) {
  const fields = new Map();
  const itemsByNumber = new Map();
  let projectId = null;
  let itemCursor = null;

  do {
    const data = await graphqlRequest(PROJECT_QUERY, { owner, number: projectNumber, itemCursor });
    const project = data.user?.projectV2;
    if (!project) throw new Error(`Project ${owner}/${projectNumber} not found`);
    projectId = projectId || project.id;

    if (fields.size === 0) {
      for (const node of project.fields.nodes) {
        if (!node?.name) continue;
        fields.set(node.name, {
          id: node.id,
          options: new Map((node.options || []).map((opt) => [opt.name, opt.id])),
        });
      }
    }

    for (const node of project.items.nodes) {
      if (
        node?.content?.__typename === 'Issue' &&
        node.content.repository.nameWithOwner === repoFullName
      ) {
        itemsByNumber.set(node.content.number, node.id);
      }
    }

    itemCursor = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (itemCursor);

  return { projectId, itemsByNumber, ...validateProjectFields(fields) };
}

export async function listIssuesForSync({
  repoOwner,
  repoName,
  githubRequest,
  eventPath,
  now = new Date(),
  closedLookbackDays = DEFAULT_CLOSED_LOOKBACK_DAYS,
}) {
  if (eventPath) {
    const event = JSON.parse(
      await import('node:fs/promises').then((fs) => fs.readFile(eventPath, 'utf8'))
    );
    if (event.issue && !event.issue.pull_request) return [event.issue];
  }

  const openIssues = await listGithubCollection(
    `/repos/${repoOwner}/${repoName}/issues?state=open&per_page=100`,
    githubRequest
  );
  const recentlyClosedIssues = await listGithubCollection(
    `/repos/${repoOwner}/${repoName}/issues?state=closed&per_page=100&since=${encodeURIComponent(buildCutoffTimestamp(now, closedLookbackDays))}`,
    githubRequest
  );

  const byNumber = new Map();
  for (const issue of openIssues) {
    if (!issue.pull_request) byNumber.set(issue.number, issue);
  }
  for (const issue of recentlyClosedIssues) {
    if (!issue.pull_request && isRecentlyClosed(issue, now, closedLookbackDays))
      byNumber.set(issue.number, issue);
  }
  return [...byNumber.values()];
}

async function ensureProjectItem(projectId, itemsByNumber, issue, graphqlRequest) {
  const existing = itemsByNumber.get(issue.number);
  if (existing) return existing;
  if (!issue.node_id) throw new Error(`Issue #${issue.number} is missing node_id`);
  const data = await graphqlRequest(ADD_ITEM_MUTATION, { projectId, contentId: issue.node_id });
  const itemId = data.addProjectV2ItemById.item.id;
  itemsByNumber.set(issue.number, itemId);
  return itemId;
}

async function setSingleSelect(projectId, itemId, field, optionName, graphqlRequest) {
  const optionId = field.options.get(optionName);
  if (!optionId) throw new Error(`Missing option "${optionName}" on field ${field.id}`);
  await graphqlRequest(SET_SINGLE_SELECT_MUTATION, {
    projectId,
    itemId,
    fieldId: field.id,
    optionId,
  });
}

async function setDate(projectId, itemId, fieldId, date, graphqlRequest) {
  if (!date) {
    await graphqlRequest(CLEAR_FIELD_MUTATION, { projectId, itemId, fieldId });
    return;
  }
  await graphqlRequest(SET_DATE_MUTATION, { projectId, itemId, fieldId, date });
}

export async function syncIssues({
  issues,
  context,
  graphqlRequest,
  logger = console,
  now = new Date(),
}) {
  const failures = [];
  for (const issue of issues) {
    try {
      if (issue.state === 'closed' && !context.itemsByNumber.has(issue.number)) {
        logger.log(
          `skipped #${issue.number}: closed issue is not currently tracked in the project`
        );
        continue;
      }
      const itemId = await ensureProjectItem(
        context.projectId,
        context.itemsByNumber,
        issue,
        graphqlRequest
      );
      const plan = classify(issue.labels || [], issue.state, now);
      await setSingleSelect(
        context.projectId,
        itemId,
        context.statusField,
        plan.status,
        graphqlRequest
      );
      await setSingleSelect(
        context.projectId,
        itemId,
        context.priorityField,
        plan.priority,
        graphqlRequest
      );
      await setSingleSelect(
        context.projectId,
        itemId,
        context.followUpField,
        plan.followUp,
        graphqlRequest
      );
      await setDate(
        context.projectId,
        itemId,
        context.nextReviewField.id,
        plan.nextReview,
        graphqlRequest
      );
      logger.log(
        `synced #${issue.number}: ${plan.status} / ${plan.priority} / ${plan.followUp}${plan.nextReview ? ` / ${plan.nextReview}` : ''}`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`#${issue.number} (${detail})`);
      logger.error(`[X] Failed to sync #${issue.number}: ${detail}`);
    }
  }
  if (failures.length > 0)
    throw new Error(`Failed to sync ${failures.length} issue(s): ${failures.join(', ')}`);
}

function formatGraphqlError(errors) {
  const raw = JSON.stringify(errors);
  if (/resource not accessible|insufficient|forbidden|project/i.test(raw)) {
    return `GitHub Project access failed. Ensure GH_TOKEN or GITHUB_TOKEN has project scope and access to the target project. Raw: ${raw}`;
  }
  return `GitHub GraphQL failed: ${raw}`;
}

function buildRuntimeConfig(env = process.env) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GH_TOKEN or GITHUB_TOKEN');
  const projectNumber = Number(env.CCS_PROJECT_NUMBER || '3');
  if (!Number.isInteger(projectNumber) || projectNumber <= 0)
    throw new Error('CCS_PROJECT_NUMBER must be a positive integer');
  return {
    token,
    owner: env.CCS_PROJECT_OWNER || 'kaitranntt',
    projectNumber,
    eventPath: env.GITHUB_EVENT_PATH,
    closedLookbackDays: Number(
      env.CCS_PROJECT_RECENTLY_CLOSED_DAYS || String(DEFAULT_CLOSED_LOOKBACK_DAYS)
    ),
    ...parseRepoFullName(env.GITHUB_REPOSITORY || DEFAULT_REPO_FULL_NAME),
  };
}

export async function runSync({ env = process.env, logger = console, fetchImpl = fetch } = {}) {
  const config = buildRuntimeConfig(env);
  const githubRequest = async (path, init = {}) => {
    const response = await fetchImpl(
      path.startsWith('http') ? path : `https://api.github.com${path}`,
      {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.headers || {}),
        },
      }
    );
    const body = await response.json();
    if (!response.ok) throw new Error(`GitHub REST ${response.status}: ${JSON.stringify(body)}`);
    return { body, headers: response.headers };
  };
  const graphqlRequest = async (query, variables = {}) => {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ query, variables }),
    });
    const body = await response.json();
    if (!response.ok || body.errors) throw new Error(formatGraphqlError(body.errors || body));
    return body.data;
  };

  const issues = await listIssuesForSync({
    repoOwner: config.repoOwner,
    repoName: config.repoName,
    githubRequest,
    eventPath: config.eventPath,
    now: new Date(),
    closedLookbackDays: config.closedLookbackDays,
  });
  const context = await getProjectContext({
    owner: config.owner,
    projectNumber: config.projectNumber,
    repoFullName: config.repoFullName,
    graphqlRequest,
  });
  await syncIssues({ issues, context, graphqlRequest, logger, now: new Date() });
}
