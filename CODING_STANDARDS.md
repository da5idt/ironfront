# Coding standards
Read during review. Mechanical rules become checks; this file holds judgement calls.
- Test fakes copy the real system's behavior, including what it silently ignores, and cite their source.
- Comments say why, not what.
- A new test is seen to fail before it is trusted: the PR body says each new test was run without the change (on the base branch, or with the change stashed) and failed. The reviewer runs at least one of them that way.
- Ironfront is an original game: no names, characters, art, music, sounds, maps or text taken from an existing game. Assets are made for this repo or carry a license that allows it, recorded beside the asset.
- `/retro` adds a rule here when review finds the same problem twice.
