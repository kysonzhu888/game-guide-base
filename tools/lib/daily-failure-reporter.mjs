const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

function assertValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function graphql({ token, query, variables, fetchImpl }) {
  const response = await fetchImpl(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Linear HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(`Linear GraphQL error: ${body.errors[0].message}`);
  }
  return body.data;
}

export function normalizeFailureReason(value) {
  const withoutAnsi = String(value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
  const firstLine = withoutAnsi
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine || "Workflow failed before producing a failure marker.").slice(0, 800);
}

export function selectFailureReason(contents) {
  const lines = contents
    .flatMap((content) => String(content ?? "").split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  const explicitMarker = lines.find((line) =>
    /^(?:CODEX_QUOTA_FAILED|BROWSER_PREFLIGHT_FAILED|DAILY_[A-Z_]*FAILED):/i.test(line));
  if (explicitMarker) return normalizeFailureReason(explicitMarker);
  const diagnostic = lines.find((line) =>
    /\b(?:failed|failure|error|blocked|unavailable|timed out)\b|失败|受阻|阻塞|超时|不可用/i.test(line));
  return normalizeFailureReason(diagnostic);
}

export function buildFailureBody({ runUrl, reason, runDate }) {
  return [
    `## 自动失败告警 · ${runDate}`,
    "",
    `- GitHub Actions：${runUrl}`,
    `- 失败原因：\`${normalizeFailureReason(reason).replaceAll("`", "'")}\``,
    "- 判定：本次运行 fail-closed；没有攻略、媒体或部署可计为成功。",
    "- 下一步：先修复失败 gate，再重跑 full；只有 main 精确 +5 且生产验证通过后才能移交 In Review。",
  ].join("\n");
}

export async function reportDailyFailure({
  token,
  issueIdentifier,
  runUrl,
  reason,
  runDate,
  fetchImpl = fetch,
}) {
  assertValue(token, "Linear token is required");
  assertValue(issueIdentifier, "Linear issue identifier is required");
  assertValue(/^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/.test(runUrl), "A real GitHub Actions run URL is required");
  const context = await graphql({
    token,
    fetchImpl,
    query: `
      query DailyFailureContext($issue: String!) {
        viewer { organization { urlKey } }
        teams { nodes { key } }
        issue(id: $issue) {
          id
          identifier
          comments(first: 50) { nodes { body } }
        }
      }
    `,
    variables: { issue: issueIdentifier },
  });
  assertValue(context.viewer?.organization?.urlKey === "uchuu", "Linear workspace is not uchuu");
  assertValue(context.teams?.nodes?.some((team) => team.key === "UCH"), "Linear team UCH is unavailable");
  assertValue(context.issue?.identifier === issueIdentifier, `Linear issue mismatch: ${issueIdentifier}`);
  if (context.issue.comments.nodes.some((comment) => comment.body?.includes(runUrl))) {
    return { status: "duplicate", issue: issueIdentifier };
  }

  const body = buildFailureBody({ runUrl, reason, runDate });
  const mutation = await graphql({
    token,
    fetchImpl,
    query: `
      mutation CreateDailyFailureComment($input: CommentCreateInput!) {
        commentCreate(input: $input) { success comment { id } }
      }
    `,
    variables: { input: { issueId: context.issue.id, body } },
  });
  assertValue(mutation.commentCreate?.success, "Linear failure comment was not created");
  return {
    status: "created",
    issue: issueIdentifier,
    commentId: mutation.commentCreate.comment.id,
  };
}
