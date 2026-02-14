import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBJXUU4V26ZGJMVM3LTICDYSGYJUMP3IUDZVK5HJRTKK6QVRFH53M5D7",
  }
} as const


export interface Game {
  player1: string;
  player1_last_guess: Option<u32>;
  player1_points: i128;
  player1_secret_hash: Option<u32>;
  player2: string;
  player2_last_guess: Option<u32>;
  player2_points: i128;
  player2_secret_hash: Option<u32>;
  status: GameStatus;
  verification_proof: Option<Buffer>;
  winner: Option<string>;
}

export const Errors = {
  1: {message:"GameNotFound"},
  2: {message:"NotPlayer"},
  3: {message:"AlreadyGuessed"},
  5: {message:"GameAlreadyEnded"},
  6: {message:"InvalidStatus"},
  7: {message:"SecretAlreadyRegistered"},
  8: {message:"BothPlayersNotGuessed"}
}

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "GameHubAddress", values: void} | {tag: "Admin", values: void};

export type GameStatus = {tag: "WaitingForPlayers", values: void} | {tag: "Setup", values: void} | {tag: "Playing", values: void} | {tag: "Finished", values: void};

export interface Client {
  /**
   * Construct and simulate a get_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current GameHub contract address
   * 
   * # Returns
   * * `Address` - The GameHub contract address
   */
  get_hub: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new GameHub contract address
   * 
   * # Arguments
   * * `new_hub` - The new GameHub contract address
   */
  set_hub: ({new_hub}: {new_hub: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the contract WASM hash (upgrade contract)
   * 
   * # Arguments
   * * `new_wasm_hash` - The hash of the new WASM binary
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get game information.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * 
   * # Returns
   * * `Game` - The game state (includes winning number after game ends)
   */
  get_game: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Game>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current admin address
   * 
   * # Returns
   * * `Address` - The admin address
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new admin address
   * 
   * # Arguments
   * * `new_admin` - The new admin address
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start a new game between two players with points.
   * This creates a session in the Game Hub and locks points before starting the game.
   * 
   * **CRITICAL:** This method requires authorization from THIS contract (not players).
   * The Game Hub will call `game_id.require_auth()` which checks this contract's address.
   * 
   * # Arguments
   * * `session_id` - Unique session identifier (u32)
   * * `player1` - Address of first player
   * * `player2` - Address of second player
   * * `player1_points` - Points amount committed by player 1
   * * `player2_points` - Points amount committed by player 2
   */
  start_game: ({session_id, player1, player2, player1_points, player2_points}: {session_id: u32, player1: string, player2: string, player1_points: i128, player2_points: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a submit_guess transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submit a guess for the opponent's secret.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * * `player` - Address of the player making the guess
   * * `guess` - The guessed number
   */
  submit_guess: ({session_id, player, guess}: {session_id: u32, player: string, guess: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a submit_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submit a ZK proof to verify a guess or claim victory.
   * (Placeholder for future ZK integration)
   */
  submit_proof: ({session_id, proof}: {session_id: u32, proof: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a verify_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify the stored proof and determine the winner.
   * (Placeholder logic: Currently just marks the caller as winner if proof exists)
   */
  verify_proof: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a register_secret transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register the secret hash for a player.
   * Both players must register their secret hash to start the game.
   * 
   * # Arguments
   * * `session_id` - The session ID of the game
   * * `player` - Address of the player registering the secret
   * * `secret_hash` - SHA256 hash of the secret number
   */
  register_secret: ({session_id, player, secret_hash}: {session_id: u32, player: string, secret_hash: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, game_hub}: {admin: string, game_hub: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, game_hub}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAALAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAAEnBsYXllcjFfbGFzdF9ndWVzcwAAAAAD6AAAAAQAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAABNwbGF5ZXIxX3NlY3JldF9oYXNoAAAAA+gAAAAEAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAAEnBsYXllcjJfbGFzdF9ndWVzcwAAAAAD6AAAAAQAAAAAAAAADnBsYXllcjJfcG9pbnRzAAAAAAALAAAAAAAAABNwbGF5ZXIyX3NlY3JldF9oYXNoAAAAA+gAAAAEAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAKR2FtZVN0YXR1cwAAAAAAAAAAABJ2ZXJpZmljYXRpb25fcHJvb2YAAAAAA+gAAAAOAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAAT",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAOQWxyZWFkeUd1ZXNzZWQAAAAAAAMAAAAAAAAAEEdhbWVBbHJlYWR5RW5kZWQAAAAFAAAAAAAAAA1JbnZhbGlkU3RhdHVzAAAAAAAABgAAAAAAAAAXU2VjcmV0QWxyZWFkeVJlZ2lzdGVyZWQAAAAABwAAAAAAAAAVQm90aFBsYXllcnNOb3RHdWVzc2VkAAAAAAAACA==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAADkdhbWVIdWJBZGRyZXNzAAAAAAAAAAAAAAAAAAVBZG1pbgAAAA==",
        "AAAAAgAAAAAAAAAAAAAACkdhbWVTdGF0dXMAAAAAAAQAAAAAAAAAAAAAABFXYWl0aW5nRm9yUGxheWVycwAAAAAAAAAAAAAAAAAABVNldHVwAAAAAAAAAAAAAAAAAAAHUGxheWluZwAAAAAAAAAAAAAAAAhGaW5pc2hlZA==",
        "AAAAAAAAAF5HZXQgdGhlIGN1cnJlbnQgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzCgojIFJldHVybnMKKiBgQWRkcmVzc2AgLSBUaGUgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAF5TZXQgYSBuZXcgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzCgojIEFyZ3VtZW50cwoqIGBuZXdfaHViYCAtIFRoZSBuZXcgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAHFVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgQXJndW1lbnRzCiogYG5ld193YXNtX2hhc2hgIC0gVGhlIGhhc2ggb2YgdGhlIG5ldyBXQVNNIGJpbmFyeQAAAAAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAJ1HZXQgZ2FtZSBpbmZvcm1hdGlvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBHYW1lYCAtIFRoZSBnYW1lIHN0YXRlIChpbmNsdWRlcyB3aW5uaW5nIG51bWJlciBhZnRlciBnYW1lIGVuZHMpAAAAAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAARHYW1lAAAAAw==",
        "AAAAAAAAAEhHZXQgdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAEpTZXQgYSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2FkbWluYCAtIFRoZSBuZXcgYWRtaW4gYWRkcmVzcwAAAAAACXNldF9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAipTdGFydCBhIG5ldyBnYW1lIGJldHdlZW4gdHdvIHBsYXllcnMgd2l0aCBwb2ludHMuClRoaXMgY3JlYXRlcyBhIHNlc3Npb24gaW4gdGhlIEdhbWUgSHViIGFuZCBsb2NrcyBwb2ludHMgYmVmb3JlIHN0YXJ0aW5nIHRoZSBnYW1lLgoKKipDUklUSUNBTDoqKiBUaGlzIG1ldGhvZCByZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gVEhJUyBjb250cmFjdCAobm90IHBsYXllcnMpLgpUaGUgR2FtZSBIdWIgd2lsbCBjYWxsIGBnYW1lX2lkLnJlcXVpcmVfYXV0aCgpYCB3aGljaCBjaGVja3MgdGhpcyBjb250cmFjdCdzIGFkZHJlc3MuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFVuaXF1ZSBzZXNzaW9uIGlkZW50aWZpZXIgKHUzMikKKiBgcGxheWVyMWAgLSBBZGRyZXNzIG9mIGZpcnN0IHBsYXllcgoqIGBwbGF5ZXIyYCAtIEFkZHJlc3Mgb2Ygc2Vjb25kIHBsYXllcgoqIGBwbGF5ZXIxX3BvaW50c2AgLSBQb2ludHMgYW1vdW50IGNvbW1pdHRlZCBieSBwbGF5ZXIgMQoqIGBwbGF5ZXIyX3BvaW50c2AgLSBQb2ludHMgYW1vdW50IGNvbW1pdHRlZCBieSBwbGF5ZXIgMgAAAAAACnN0YXJ0X2dhbWUAAAAAAAUAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAAB3BsYXllcjEAAAAAEwAAAAAAAAAHcGxheWVyMgAAAAATAAAAAAAAAA5wbGF5ZXIxX3BvaW50cwAAAAAACwAAAAAAAAAOcGxheWVyMl9wb2ludHMAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAALVTdWJtaXQgYSBndWVzcyBmb3IgdGhlIG9wcG9uZW50J3Mgc2VjcmV0LgoKIyBBcmd1bWVudHMKKiBgc2Vzc2lvbl9pZGAgLSBUaGUgc2Vzc2lvbiBJRCBvZiB0aGUgZ2FtZQoqIGBwbGF5ZXJgIC0gQWRkcmVzcyBvZiB0aGUgcGxheWVyIG1ha2luZyB0aGUgZ3Vlc3MKKiBgZ3Vlc3NgIC0gVGhlIGd1ZXNzZWQgbnVtYmVyAAAAAAAADHN1Ym1pdF9ndWVzcwAAAAMAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAAFZ3Vlc3MAAAAAAAAEAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAF1TdWJtaXQgYSBaSyBwcm9vZiB0byB2ZXJpZnkgYSBndWVzcyBvciBjbGFpbSB2aWN0b3J5LgooUGxhY2Vob2xkZXIgZm9yIGZ1dHVyZSBaSyBpbnRlZ3JhdGlvbikAAAAAAAAMc3VibWl0X3Byb29mAAAAAgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAFcHJvb2YAAAAAAAAOAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAIBWZXJpZnkgdGhlIHN0b3JlZCBwcm9vZiBhbmQgZGV0ZXJtaW5lIHRoZSB3aW5uZXIuCihQbGFjZWhvbGRlciBsb2dpYzogQ3VycmVudGx5IGp1c3QgbWFya3MgdGhlIGNhbGxlciBhcyB3aW5uZXIgaWYgcHJvb2YgZXhpc3RzKQAAAAx2ZXJpZnlfcHJvb2YAAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAQAAA+kAAAATAAAAAw==",
        "AAAAAAAAAKNJbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIEdhbWVIdWIgYWRkcmVzcyBhbmQgYWRtaW4KCiMgQXJndW1lbnRzCiogYGFkbWluYCAtIEFkbWluIGFkZHJlc3MgKGNhbiB1cGdyYWRlIGNvbnRyYWN0KQoqIGBnYW1lX2h1YmAgLSBBZGRyZXNzIG9mIHRoZSBHYW1lSHViIGNvbnRyYWN0AAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhnYW1lX2h1YgAAABMAAAAA",
        "AAAAAAAAAQxSZWdpc3RlciB0aGUgc2VjcmV0IGhhc2ggZm9yIGEgcGxheWVyLgpCb3RoIHBsYXllcnMgbXVzdCByZWdpc3RlciB0aGVpciBzZWNyZXQgaGFzaCB0byBzdGFydCB0aGUgZ2FtZS4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKKiBgcGxheWVyYCAtIEFkZHJlc3Mgb2YgdGhlIHBsYXllciByZWdpc3RlcmluZyB0aGUgc2VjcmV0CiogYHNlY3JldF9oYXNoYCAtIFNIQTI1NiBoYXNoIG9mIHRoZSBzZWNyZXQgbnVtYmVyAAAAD3JlZ2lzdGVyX3NlY3JldAAAAAADAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAAC3NlY3JldF9oYXNoAAAAAAQAAAABAAAD6QAAAAIAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_hub: this.txFromJSON<string>,
        set_hub: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        get_game: this.txFromJSON<Result<Game>>,
        get_admin: this.txFromJSON<string>,
        set_admin: this.txFromJSON<null>,
        start_game: this.txFromJSON<Result<void>>,
        submit_guess: this.txFromJSON<Result<void>>,
        submit_proof: this.txFromJSON<Result<void>>,
        verify_proof: this.txFromJSON<Result<string>>,
        register_secret: this.txFromJSON<Result<void>>
  }
}