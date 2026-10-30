-- Extra demo data for the documentation screenshots, on top of `bun run db:dev`
-- (workspace "Nimbus") and the capture kit's demo views. Everything here is
-- invented; the people and the company do not exist.
--
--   psql -h localhost -U postgres -d IssueTracker -f scripts/docs-shots/demo.sql

-- Web App uses the planning fields, so the issue page shows them.
update "Project" set "hiddenDetailFields" = '{}' where slug = 'web-app';

with p as (select id from "Project" where slug = 'web-app'),
     d as (select date_trunc('day', now()) + interval '12 hours' as today)
update "Issue" i set
  "dueDate" = d.today + v.due, "storyPoints" = v.pts, "estimateHours" = v.hrs, "estimateUnit" = v.unit
from p, d, (values
  (1, interval '2 days',  5, 16.0, 'days'),
  (2, interval '6 days',  3, 8.0,  'hours'),
  (3, interval '-1 day',  8, 40.0, 'days'),
  (8, interval '9 days',  2, 4.0,  'hours'),
  (9, interval '4 days',  5, 24.0, 'days'),
  (10, interval '-3 days', 1, 2.0, 'hours'),
  (11, interval '5 days', 8, 32.0, 'days')
) as v(k, due, pts, hrs, unit)
where i."projectId" = p.id and i.key = v.k;

-- Sub-issues under NIM-11 (Comment editing & @mentions)
insert into "Issue"(id, key, title, status, priority, type, labels, rank, created, updated, "closedAt", "dueDate", "storyPoints", "assigneeId", "reporterId", "projectId", "parentId")
select 'idoc-' || v.k, v.k, v.title, v.status, v.prio, 'feature',
       array[(select id from "Label" where name = 'Feature'), (select id from "Label" where name = 'Frontend')],
       v.k * 10, now() - interval '3 days', now() - interval '6 hours',
       case when v.status = 'done' then now() - interval '1 day' end,
       date_trunc('day', now()) + interval '12 hours' + v.due, v.pts,
       (select id from "User" where email = v.assignee), (select id from "User" where email = 'owner@nimbus.io'),
       p.id, (select id from "Issue" where "projectId" = p.id and key = 11)
from "Project" p, (values
  (12, 'Mention suggestions list in the editor', 'done',        2, interval '-1 day', 3, 'member2@nimbus.io'),
  (13, 'Show an "edited" mark on changed comments', 'in_progress', 2, interval '2 days',  2, 'member5@nimbus.io'),
  (14, 'Emoji reactions on comments',               'todo',        1, interval '5 days',  3, 'member1@nimbus.io')
) as v(k, title, status, prio, due, pts, assignee)
where p.slug = 'web-app';
update "Project" set "lastIssueKey" = 14 where slug = 'web-app';

-- Relations on NIM-11
insert into "IssueRelation"(id, type, created, "issueId", "relatedId")
select 'rdoc-1', 'BLOCKS', now() - interval '2 days',
  (select id from "Issue" where "projectId" = p.id and key = 1), (select id from "Issue" where "projectId" = p.id and key = 11)
from "Project" p where p.slug = 'web-app';
insert into "IssueRelation"(id, type, created, "issueId", "relatedId")
select 'rdoc-2', 'RELATES_TO', now() - interval '2 days',
  (select id from "Issue" where "projectId" = p.id and key = 8), (select id from "Issue" where "projectId" = p.id and key = 11)
from "Project" p where p.slug = 'web-app';

-- A thread on NIM-1: a reply and reactions
insert into "Comment"(id, body, "bodyText", created, "issueId", "authorId", "parentId")
select 'cdoc-1', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Great find. Can you add a regression test before it ships?"}]}]}',
  'Great find. Can you add a regression test before it ships?', now() - interval '7 hours',
  i.id, (select id from "User" where email = 'owner@nimbus.io'),
  (select c.id from "Comment" c where c."issueId" = i.id and c."authorId" = (select id from "User" where email = 'member2@nimbus.io') limit 1)
from "Issue" i join "Project" p on p.id = i."projectId" where p.slug = 'web-app' and i.key = 1;
insert into "CommentReaction"(id, "commentId", "userId", emoji)
select 'rx-' || v.n, c.id, u.id, v.e
from (values (1, 'owner@nimbus.io', '👍'), (2, 'admin@nimbus.io', '👍'), (3, 'member5@nimbus.io', '🎉')) as v(n, email, e)
join "User" u on u.email = v.email,
(select c.id from "Comment" c join "Issue" i on i.id = c."issueId" join "Project" p on p.id = i."projectId"
 where p.slug = 'web-app' and i.key = 1 and c."parentId" is null and c."authorId" = (select id from "User" where email = 'member2@nimbus.io') limit 1) c;
-- ... and a comment with a mention on NIM-11
insert into "Comment"(id, body, "bodyText", created, "issueId", "authorId")
select 'cdoc-2', jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content', jsonb_build_array(
    jsonb_build_object('type','text','text','Looks good to me. '),
    jsonb_build_object('type','mention','attrs', jsonb_build_object('id', (select id from "User" where email = 'owner@nimbus.io'), 'label', 'owner')),
    jsonb_build_object('type','text','text',' can you have a look at the reaction picker before we ship?')))))::json,
  'Looks good to me. @owner can you have a look at the reaction picker before we ship?', now() - interval '2 hours',
  i.id, (select id from "User" where email = 'member2@nimbus.io')
from "Issue" i join "Project" p on p.id = i."projectId" where p.slug = 'web-app' and i.key = 11;

-- The owner's inbox
insert into "Notification"(id, "userId", type, "createdAt", "readAt", "workspaceId", "projectId", "issueId", "actorId", "actorLabel", text)
select 'ndoc-' || v.n, (select id from "User" where email = 'owner@nimbus.io'), v.type, now() - v.ago,
       case when v.is_read then now() - v.ago + interval '10 minutes' end,
       'nimbus', i."projectId", i.id, (select id from "User" where email = v.actor), v.actor_label, v.txt
from (values
  (1, 'assigned',    interval '20 minutes', false, 'admin@nimbus.io',    'Lena Brandt',  9,  ''),
  (2, 'mentioned',   interval '2 hours',    false, 'member2@nimbus.io',  'Aisha Rahman', 11, 'Looks good to me. @owner can you have a look at the reaction picker'),
  (3, 'comment',     interval '7 hours',    false, 'member2@nimbus.io',  'Aisha Rahman', 1,  'Found it: we set the cookie before the redirect resolves.'),
  (4, 'status',      interval '1 day',      true,  'member5@nimbus.io',  'Kwame Boateng', 7, 'done'),
  (5, 'issueShared', interval '2 days',     true,  'projectlead1@nimbus.io', 'Marco Rossi', 3, ''),
  (6, 'commentReply', interval '3 days',    true,  'member1@nimbus.io',  'Tomas Køhler', 1,  'Thanks, that makes sense.')
) as v(n, type, ago, is_read, actor, actor_label, k, txt)
join "Project" p on p.slug = 'web-app'
join "Issue" i on i."projectId" = p.id and i.key = v.k;

-- Activity in the workspace
insert into "AuditLog"(id, "createdAt", action, "actorId", "actorLabel", "targetType", "targetLabel", "workspaceId", "projectId", reason)
select 'adoc-' || v.n, now() - v.ago, v.action, (select id from "User" where email = v.actor), v.actor_label, v.ttype, v.target, 'nimbus',
       (select id from "Project" where slug = v.proj), v.reason
from (values
  (1,  interval '35 minutes', 'issue.assigned',         'admin@nimbus.io',   'Lena Brandt',  'issue',   'NIM-9 Command palette: fuzzy search for issues', 'web-app', null),
  (2,  interval '2 hours',    'issue.comment.added',    'member2@nimbus.io', 'Aisha Rahman', 'issue',   'NIM-11 Comment editing & @mentions',          'web-app', null),
  (3,  interval '5 hours',    'issue.status.changed',   'member5@nimbus.io', 'Kwame Boateng','issue',   'NIM-7 Onboarding: empty states feel cold',    'web-app', null),
  (4,  interval '7 hours',    'issue.shared',           'owner@nimbus.io',   'Mara Velez',   'issue',   'NIM-1 OAuth callback drops session on Safari 17', 'web-app', null),
  (5,  interval '1 day',      'issue.created',          'owner@nimbus.io',   'Mara Velez',   'issue',   'NIM-14 Emoji reactions on comments',          'web-app', null),
  (6,  interval '1 day 3 hours','project.member.added', 'admin@nimbus.io',   'Lena Brandt',  'user',    'Jonas Berger',                                 'web-app', null),
  (7,  interval '2 days',     'member.role.changed',    'admin@nimbus.io',   'Lena Brandt',  'user',    'Priya Nair',                                   null,      null),
  (8,  interval '3 days',     'project.visibility.changed','owner@nimbus.io','Mara Velez',   'project', 'Vault',                                        'vault',   null),
  (9,  interval '3 days 2 hours','member.added',        'admin@nimbus.io',   'Lena Brandt',  'user',    'Camila Santos',                                null,      null),
  (10, interval '4 days',     'issue.priority.changed', 'projectlead1@nimbus.io','Marco Rossi','issue', 'NIM-3 Board column virtualization for 500+ cards','web-app', null),
  (11, interval '5 days',     'project.created',        'owner@nimbus.io',   'Mara Velez',   'project', 'Vault',                                        'vault',   null),
  (12, interval '6 days',     'project.breakglass',     'support@nimbus.io', 'Robin Weiss',  'project', 'Vault',                                        'vault',   'Project lead unreachable during the release, rolling back a wrong setting.')
) as v(n, ago, action, actor, actor_label, ttype, target, proj, reason);
-- Sign-ins for the platform audit log
insert into "AuditLog"(id, "createdAt", action, "actorId", "actorLabel", "targetType", "targetLabel")
select 'alog-' || v.n, now() - v.ago, v.action, (select id from "User" where email = v.actor), v.label, 'user', v.label
from (values
  (1, interval '12 minutes', 'auth.login',        'owner@nimbus.io',   'Mara Velez'),
  (2, interval '1 hour',     'auth.login',        'member2@nimbus.io', 'Aisha Rahman'),
  (3, interval '3 hours',    'auth.login',        'admin@nimbus.io',   'Lena Brandt'),
  (4, interval '1 day',      'auth.login.failed', null,                'unknown@example.com'),
  (5, interval '1 day',      'auth.login',        'member5@nimbus.io', 'Kwame Boateng')
) as v(n, ago, action, actor, label);

-- A custom role that lets contributors edit every issue of a project
insert into "Role"(id, scope, "workspaceId", "projectId", key, name, "desc", rank, editable, system)
values ('rdoc-custom', 'PROJECT', 'nimbus', null, 'team_member', 'Team member', 'Like a Contributor, but may edit every issue.', 3, true, false);
insert into "RolePermission"("roleId", "permissionKey")
select 'rdoc-custom', k from (values ('project.view'),('issue.create'),('issue.update.any'),('issue.update.own'),('issue.delete.own'),('issue.assign'),
  ('issue.share.manage'),('comment.create'),('comment.delete.own'),('comment.update.own'),('comment.react'),('label.create'),('label.update'),('view.share')) as t(k);

-- Domain auto-join and workspace links
insert into "WorkspaceDomain"(domain, "workspaceId") values ('nimbus.io', 'nimbus');
insert into "WorkspaceLink"(id, "workspaceId", label, url, position) values
  ('wl-1', 'nimbus', 'Handbook', 'https://handbook.nimbus.io', 0),
  ('wl-2', 'nimbus', 'Status page', 'https://status.nimbus.io', 1);

-- Webhooks: one that works, one that does not
insert into "Webhook"(id, "workspaceId", url, secret, events, enabled, "createdById", "createdAt", "lastDeliveryAt", "lastDeliveryStatus", "lastDeliveryError")
select 'whdoc-1', 'nimbus', 'https://hooks.nimbus.io/barynt/chat', 'whsec_demo_1', array['issue.created','issue.updated','comment.created'], true,
       u.id, now() - interval '9 days', now() - interval '35 minutes', 200, null from "User" u where u.email = 'owner@nimbus.io';
insert into "Webhook"(id, "workspaceId", url, secret, events, enabled, "createdById", "createdAt", "lastDeliveryAt", "lastDeliveryStatus", "lastDeliveryError")
select 'whdoc-2', 'nimbus', 'https://reports.nimbus.io/hooks/issues', 'whsec_demo_2', array['issue.created','issue.updated','issue.deleted'], true,
       u.id, now() - interval '20 days', now() - interval '3 hours', null, 'The operation was aborted due to timeout' from "User" u where u.email = 'owner@nimbus.io';

-- An older API key
insert into "ApiKey"(id, "userId", name, prefix, "tokenHash", scopes, "lastUsedAt", "createdAt")
select 'akdoc-1', u.id, 'Support form', 'bry_k3f9', 'demo-hash-1', array['issues:read','issues:write','labels:read'], now() - interval '2 hours', now() - interval '12 days'
from "User" u where u.email = 'owner@nimbus.io';
