# Teams own issues, projects span teams

We follow Linear's model. Issues belong to exactly one team and take its key (`ENG-123`), and teams own statuses and labels. Projects are goals that group issues from any team. We rejected the Plane and Jira model, where projects own issues and teams are only access groups, because cross-team goals are common and an issue's home should be the team doing the work, not the initiative it serves.

## Consequences

Moving an issue between teams changes its identifier. Old identifiers must keep resolving everywhere, since agents hold them in context and pull request descriptions.
