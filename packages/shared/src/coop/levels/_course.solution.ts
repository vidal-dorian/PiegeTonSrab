/**
 * Bot solution of the practice course: everyone lines up against the wall, Ruben's neighbour climbs
 * on Ruben and jumps onto the wall, walks on (picking up the key) and hauls the chain up, then
 * everyone goes through the door.
 */
import { cond, enter, friends, jumpTo, mount, walk, type CoopSolution, type Role } from "../bots";

export const solution: CoopSolution = (n) => {
  const climber: Role = friends(n)[n - 2]!; // Ruben's neighbour in the chain
  return [
    {
      name: "line up against the wall",
      do: { R: walk(14.4), "*": (i) => walk(14.4 - (n - 1 - i) * 1.0, { jump: "never" }) },
      until: cond.all(cond.near("R", 14.4, 0.25), cond.near(climber, 13.4, 0.3)),
    },
    { name: "the climber gets on Ruben", do: { [climber]: mount("R") }, until: cond.on(climber, "R") },
    { name: "the climber jumps onto the wall", do: { [climber]: jumpTo(17.5, { rise: 0.15 }) }, until: cond.standsAbove(climber, 9) },
    {
      // The climber walks on (picking up the key) and hauls Ruben and the others up; they line up behind.
      name: "haul everyone up",
      do: {
        [climber]: walk(29.5, { jump: "never" }),
        R: walk(28.5, { jump: "never" }),
        "*": (i) => walk(29.5 - (n - 1 - i), { jump: "never" }),
      },
      until: cond.allAbove(9),
      timeout: 30,
    },
    { name: "everyone through the door", do: { "*": () => enter() }, until: cond.won },
  ];
};
