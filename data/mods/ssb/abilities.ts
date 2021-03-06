import {SSBSet, ssbSets} from "./random-teams";
import {getName} from './conditions';

// Used in many abilities, placed here to reduce the number of updates needed and to reduce the chance of errors
const STRONG_WEATHERS = ['desolateland', 'primordialsea', 'deltastream', 'heavyhailstorm', 'winterhail', 'turbulence'];

/**
 * Assigns a new set to a Pokémon
 * @param pokemon the Pokemon to assign the set to
 * @param newSet the SSBSet to assign
 */
export function changeSet(context: Battle, pokemon: Pokemon, newSet: SSBSet, changeAbility = false) {
	if (pokemon.transformed) return;
	const evs: StatsTable = {
		hp: newSet.evs?.hp || 0,
		atk: newSet.evs?.atk || 0,
		def: newSet.evs?.def || 0,
		spa: newSet.evs?.spa || 0,
		spd: newSet.evs?.spd || 0,
		spe: newSet.evs?.spe || 0,
	};
	const ivs: StatsTable = {
		hp: newSet.ivs?.hp || 31,
		atk: newSet.ivs?.atk || 31,
		def: newSet.ivs?.def || 31,
		spa: newSet.ivs?.spa || 31,
		spd: newSet.ivs?.spd || 31,
		spe: newSet.ivs?.spe || 31,
	};
	pokemon.set.evs = evs;
	pokemon.set.ivs = ivs;
	if (newSet.nature) pokemon.set.nature = Array.isArray(newSet.nature) ? context.sample(newSet.nature) : newSet.nature;
	const oldShiny = pokemon.set.shiny;
	pokemon.set.shiny = (typeof newSet.shiny === 'number') ? context.randomChance(1, newSet.shiny) : !!newSet.shiny;
	let percent = (pokemon.hp / pokemon.baseMaxhp);
	if (newSet.species === 'Shedinja') percent = 1;
	pokemon.formeChange(newSet.species, context.effect, true);
	const details = pokemon.species.name + (pokemon.level === 100 ? '' : ', L' + pokemon.level) +
		(pokemon.gender === '' ? '' : ', ' + pokemon.gender) + (pokemon.set.shiny ? ', shiny' : '');
	if (oldShiny !== pokemon.set.shiny) context.add('replace', pokemon, details);
	if (changeAbility) pokemon.setAbility(newSet.ability as string);

	pokemon.baseMaxhp = pokemon.species.name === 'Shedinja' ? 1 : Math.floor(Math.floor(
		2 * pokemon.species.baseStats.hp + pokemon.set.ivs.hp + Math.floor(pokemon.set.evs.hp / 4) + 100
	) * pokemon.level / 100 + 10);
	const newMaxHP = pokemon.baseMaxhp;
	pokemon.hp = Math.round(newMaxHP * percent);
	pokemon.maxhp = newMaxHP;
	context.add('-heal', pokemon, pokemon.getHealth, '[silent]');
	if (pokemon.item) {
		let item = newSet.item;
		if (typeof item !== 'string') item = item[context.random(item.length)];
		if (context.toID(item) !== (pokemon.item || pokemon.lastItem)) pokemon.setItem(item);
	}
	if (!pokemon.m.datacorrupt) {
		const newMoves = changeMoves(context, pokemon, newSet.moves.concat(newSet.signatureMove));
		pokemon.moveSlots = newMoves;
		// @ts-ignore Necessary so pokemon doesn't get 8 moves
		pokemon.baseMoveSlots = newMoves;
	}
	context.add('-ability', pokemon, `${pokemon.getAbility().name}`);
	context.add('message', `${pokemon.name} changed form!`);
}

/**
 * Assigns new moves to a Pokemon
 * @param pokemon The Pokemon whose moveset is to be modified
 * @param newSet The set whose moves should be assigned
 */
export function changeMoves(context: Battle, pokemon: Pokemon, newMoves: (string | string[])[]) {
	const carryOver = pokemon.moveSlots.slice().map(m => m.pp / m.maxpp);
	// In case there are ever less than 4 moves
	while (carryOver.length < 4) {
		carryOver.push(1);
	}
	const result = [];
	let slot = 0;
	for (const newMove of newMoves) {
		const moveName = Array.isArray(newMove) ? newMove[context.random(newMove.length)] : newMove;
		const move = context.dex.moves.get(context.toID(moveName));
		if (!move.id) continue;
		const moveSlot = {
			move: move.name,
			id: move.id,
			// eslint-disable-next-line max-len
			pp: ((move.noPPBoosts || move.isZ) ? Math.floor(move.pp * carryOver[slot]) : Math.floor((move.pp * (8 / 5)) * carryOver[slot])),
			maxpp: ((move.noPPBoosts || move.isZ) ? move.pp : move.pp * 8 / 5),
			target: move.target,
			disabled: false,
			disabledSource: '',
			used: false,
		};
		result.push(moveSlot);
		slot++;
	}
	return result;
}

export const Abilities: {[k: string]: ModdedAbilityData} = {
	/*
	// Example
	"abilityid": {
		desc: "", // long description
		shortDesc: "", // short description, shows up in /dt
		name: "Ability Name",
		// The bulk of an ability is not easily shown in an example since it varies
		// For more examples, see https://github.com/smogon/pokemon-showdown/blob/master/data/abilities.js
	},
	*/
	// Please keep abilites organized alphabetically based on staff member name!
	// Brookeee
	aggression: {
		desc: "This Pokemon's attack is raised by 1 stage after it is damaged by a move; half damage received at full HP.",
		shortDesc: "+1 Atk whenever hit; half damage taken at full HP.",
		onSourceModifyDamage(damage, source, target, move) {
			if (target.hp >= target.maxhp) {
				this.debug('Aggression weaken');
				return this.chainModify(0.5);
			}
		},
		onDamagingHit(damage, target, source, effect) {
			this.boost({atk: 1});
		},
		isBreakable: true,
		name: "Aggression",
		gen: 8,
	},

	// Genwunner
	bestgen: {
		desc: "This Pokemon has +1 critical hit ratio; Blizzard has 90% accuracy; no recharge on KO; Special stats are combined.",
		shortDesc: "+1 crit rate; 90% acc Blizzard; no recharge on KO; combined Special.",
		onModifyCritRatio(critRatio) {
			return critRatio + 1
		},
		onModifyMove(move) {
			if (move.id === 'blizzard') move.accuracy = 90;
		},
		onBoost(boost, target, source, effect) {
			if (boost.spa) {
				boost.spd = boost.spa;
			}
			if (boost.spd) {
				boost.spa = boost.spd;
			}
		},
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (!target || target.fainted || target.hp <= 0) {
				if (pokemon.volatiles['mustrecharge']) {
					delete pokemon.volatiles['mustrecharge'];
				}
			}
		},
		name: "Best Gen",
		gen: 8,
	},

	// Horrific17
	fairfight: {
		desc: "Sets up Magic Room, Haze and Fairy Lock on switch-in.",
		shortDesc: "Magic Room, Haze and Fairy Lock on switch-in.",
		onStart(pokemon) {
			this.actions.useMove("magicroom", pokemon);
			this.actions.useMove("haze", pokemon);
			this.actions.useMove("fairylock", pokemon);
		},
		name: "Fair Fight",
		gen: 8,
	},

	// LandoriumZ
	retaliation: {
		desc: "This Pokemon moves last among Pokemon using the same or greater priority moves; evasiveness is doubled if confused, 1.25x otherwise; damage is doubled if not damaged.",
		shortDesc: "Moves last; 2x evasiveness if confused, 1.25x otherwise; 2x damage if not hit.",
		onFractionalPriority: -0.1,
		onModifyAccuracyPriority: -1,
		onModifyAccuracy(accuracy, target) {
			if (typeof accuracy !== 'number') return;
			if (target?.volatiles['confusion']) {
				this.debug('Retaliation - decreasing accuracy');
				return this.chainModify(0.4);
			} else {
				return this.chainModify(0.8);
			}
		},
		onBasePowerPriority: 31,
		onBasePower(basePower, pokemon, target, move) {
			const damagedByTarget = pokemon.attackedBy.some(p => p.source === target && p.damage > 0 && p.thisTurn);
			if (!damagedByTarget) {
				return move.basePower * 2;
			}
			return move.basePower;
		},
		isBreakable: true,
		name: "Retaliation",
		gen: 8,
	},

	// Mayie
	finalprayer: {
		desc: "This Pokemon is immune to status ailments; uses Wish and Aqua Ring when switching in and Safeguard when switching out; Lunar Dance when knocked out.",
		shortDesc: "Status immunity; Wish and Aqua Ring on switch-in, Safeguard on switch-out; Lunar Dance on KO.",
		onSetStatus(status, target, source, effect) {
			if ((effect as Move)?.status) {
				this.add('-immune', target, '[from] ability: Final Prayer');
			}
			return false;
		},
		onTryAddVolatile(status, target) {
			if (status.id === 'yawn') {
				this.add('-immune', target, '[from] ability: Final Prayer');
				return null;
			}
		},
		onStart(pokemon) {
			this.actions.useMove("wish", pokemon);
			this.actions.useMove("aquaring", pokemon);
		},
		onSwitchOut(pokemon) {
			this.actions.useMove("safeguard", pokemon);
		},
		onFaint(pokemon) {
			this.actions.useMove("lunardance", pokemon);
		},
		isBreakable: true,
		name: "Final Prayer",
		gen: 8,
	},

	// Omega
	burnheal: {
		desc: "Heals 1/8 of max HP per turn when burned.",
		shortDesc: "+1/8 mHP/turn when burned.",
		onDamagePriority: 1,
		onDamage(damage, target, source, effect) {
			if (effect.id === 'brn') {
				this.heal(target.baseMaxhp / 8);
				return false;
			}
		},
		name: "Burn Heal",
		gen: 8,
	},
};
