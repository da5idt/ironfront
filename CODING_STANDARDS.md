# Coding standards
Read during review. Mechanical rules become checks; this file holds judgement calls.
- Test fakes copy the real system's behavior, including what it silently ignores, and cite their source.
- Comments say why, not what.
- A new test is seen to fail before it is trusted: the PR body says each new test was run without the change (on the base branch, or with the change stashed) and failed, or says why a test cannot be made to fail that way. The reviewer runs at least one of them that way.
- Ironfront is an original game: no names, characters, art, music, sounds, maps or text taken from an existing game. Assets are made for this repo or carry a license that allows it, recorded beside the asset.
- Fog of War: everything a Player learns comes from that Player's view. That covers what is drawn, heard and spoken, what the Computer Opponent decides on, and whether a Command is accepted: a rejection that depends on something the Player cannot see is a leak.
- Words: identifiers, comments and on-screen text use the `GLOSSARY.md` term for a concept, and a word listed under _Avoid_ is not used for that concept. A new concept gets a glossary entry in the same PR.
- A change under `src/client` is reviewed in the running game as well as in the diff: build it, open it in headless Chromium at 1366x657 and 1280x800, press every menu button and key the change touches, and play until the change is seen working. A change to how a Match starts, ends or alerts is played to Victory or defeat.
- `/retro` adds a rule here when review finds the same problem twice.
