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
    contractId: "CBT7WHXWSTR53WGWGQWJRXJHY5L3NMLQBZ7UIC34VQDOQMSZQPACJ4GI",
  }
} as const


export interface Game {
  p1_is_fraud: boolean;
  p1_proof_verified: boolean;
  p2_is_fraud: boolean;
  p2_proof_verified: boolean;
  player1: string;
  player1_last_guess: Option<u32>;
  player1_points: i128;
  player1_proof: Array<ProofData>;
  player1_result: Array<GameResult>;
  player1_secret_hash: Option<Buffer>;
  player2: string;
  player2_last_guess: Option<u32>;
  player2_points: i128;
  player2_proof: Array<ProofData>;
  player2_result: Array<GameResult>;
  player2_secret_hash: Option<Buffer>;
  status: GameStatus;
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

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "GameHubAddress", values: void} | {tag: "Admin", values: void} | {tag: "VerificationKey", values: void};


export interface ProofData {
  acertos: u32;
  erros: u32;
  permutados: u32;
  player: string;
  proof: Buffer;
}


export interface GameResult {
  acertos: u32;
  erros: u32;
  permutados: u32;
  player: string;
}

export type GameStatus = {tag: "WaitingForPlayers", values: void} | {tag: "Setup", values: void} | {tag: "Playing", values: void} | {tag: "Draw", values: void} | {tag: "Winner", values: void} | {tag: "Finished", values: void};

export interface Client {
  /**
   * Construct and simulate a get_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_hub: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_hub: ({new_hub}: {new_hub: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_game: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Game>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, game_hub}: {admin: string, game_hub: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  start_game: ({session_id, player1, player2, player1_points, player2_points}: {session_id: u32, player1: string, player2: string, player1_points: i128, player2_points: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a submit_guess transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  submit_guess: ({session_id, player, guess}: {session_id: u32, player: string, guess: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a submit_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  submit_proof: ({session_id, player, acertos, permutados, erros, proof}: {session_id: u32, player: string, acertos: u32, permutados: u32, erros: u32, proof: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a verify_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify_proof: ({session_id, caller}: {session_id: u32, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Option<readonly [GameResult, GameResult]>>>>

  /**
   * Construct and simulate a has_game_ended transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  has_game_ended: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Option<string>>>>

  /**
   * Construct and simulate a get_game_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_game_status: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<GameStatus>>>

  /**
   * Construct and simulate a register_secret transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  register_secret: ({session_id, player, secret_hash}: {session_id: u32, player: string, secret_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_player_result transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_player_result: ({session_id, player}: {session_id: u32, player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<GameResult>>>

  /**
   * Construct and simulate a get_verification_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_verification_key: (options?: MethodOptions) => Promise<AssembledTransaction<Option<Buffer>>>

  /**
   * Construct and simulate a set_verification_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_verification_key: ({vk}: {vk: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAASAAAAAAAAAAtwMV9pc19mcmF1ZAAAAAABAAAAAAAAABFwMV9wcm9vZl92ZXJpZmllZAAAAAAAAAEAAAAAAAAAC3AyX2lzX2ZyYXVkAAAAAAEAAAAAAAAAEXAyX3Byb29mX3ZlcmlmaWVkAAAAAAAAAQAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAABJwbGF5ZXIxX2xhc3RfZ3Vlc3MAAAAAA+gAAAAEAAAAAAAAAA5wbGF5ZXIxX3BvaW50cwAAAAAACwAAAAAAAAANcGxheWVyMV9wcm9vZgAAAAAAA+oAAAfQAAAACVByb29mRGF0YQAAAAAAAAAAAAAOcGxheWVyMV9yZXN1bHQAAAAAA+oAAAfQAAAACkdhbWVSZXN1bHQAAAAAAAAAAAATcGxheWVyMV9zZWNyZXRfaGFzaAAAAAPoAAAD7gAAACAAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAScGxheWVyMl9sYXN0X2d1ZXNzAAAAAAPoAAAABAAAAAAAAAAOcGxheWVyMl9wb2ludHMAAAAAAAsAAAAAAAAADXBsYXllcjJfcHJvb2YAAAAAAAPqAAAH0AAAAAlQcm9vZkRhdGEAAAAAAAAAAAAADnBsYXllcjJfcmVzdWx0AAAAAAPqAAAH0AAAAApHYW1lUmVzdWx0AAAAAAAAAAAAE3BsYXllcjJfc2VjcmV0X2hhc2gAAAAD6AAAA+4AAAAgAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAKR2FtZVN0YXR1cwAAAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAAT",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAOQWxyZWFkeUd1ZXNzZWQAAAAAAAMAAAAAAAAAEEdhbWVBbHJlYWR5RW5kZWQAAAAFAAAAAAAAAA1JbnZhbGlkU3RhdHVzAAAAAAAABgAAAAAAAAAXU2VjcmV0QWxyZWFkeVJlZ2lzdGVyZWQAAAAABwAAAAAAAAAVQm90aFBsYXllcnNOb3RHdWVzc2VkAAAAAAAACA==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAADkdhbWVIdWJBZGRyZXNzAAAAAAAAAAAAAAAAAAVBZG1pbgAAAAAAAAAAAAAAAAAAD1ZlcmlmaWNhdGlvbktleQA=",
        "AAAAAQAAAAAAAAAAAAAACVByb29mRGF0YQAAAAAAAAUAAAAAAAAAB2FjZXJ0b3MAAAAABAAAAAAAAAAFZXJyb3MAAAAAAAAEAAAAAAAAAApwZXJtdXRhZG9zAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAABXByb29mAAAAAAAADg==",
        "AAAAAQAAAAAAAAAAAAAACkdhbWVSZXN1bHQAAAAAAAQAAAAAAAAAB2FjZXJ0b3MAAAAABAAAAAAAAAAFZXJyb3MAAAAAAAAEAAAAAAAAAApwZXJtdXRhZG9zAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABM=",
        "AAAAAgAAAAAAAAAAAAAACkdhbWVTdGF0dXMAAAAAAAYAAAAAAAAAAAAAABFXYWl0aW5nRm9yUGxheWVycwAAAAAAAAAAAAAAAAAABVNldHVwAAAAAAAAAAAAAAAAAAAHUGxheWluZwAAAAAAAAAAAAAAAAREcmF3AAAAAAAAAAAAAAAGV2lubmVyAAAAAAAAAAAAAAAAAAhGaW5pc2hlZA==",
        "AAAAAAAAAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAIZ2V0X2dhbWUAAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAQAAA+kAAAfQAAAABEdhbWUAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhnYW1lX2h1YgAAABMAAAAA",
        "AAAAAAAAAAAAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAAA5wbGF5ZXIyX3BvaW50cwAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAMc3VibWl0X2d1ZXNzAAAAAwAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAVndWVzcwAAAAAAAAQAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAMc3VibWl0X3Byb29mAAAABgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAdhY2VydG9zAAAAAAQAAAAAAAAACnBlcm11dGFkb3MAAAAAAAQAAAAAAAAABWVycm9zAAAAAAAABAAAAAAAAAAFcHJvb2YAAAAAAAAOAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAMdmVyaWZ5X3Byb29mAAAAAgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAPoAAAD7QAAAAIAAAfQAAAACkdhbWVSZXN1bHQAAAAAB9AAAAAKR2FtZVJlc3VsdAAAAAAAAw==",
        "AAAAAAAAAAAAAAAOaGFzX2dhbWVfZW5kZWQAAAAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAA+gAAAATAAAAAw==",
        "AAAAAAAAAAAAAAAPZ2V0X2dhbWVfc3RhdHVzAAAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAB9AAAAAKR2FtZVN0YXR1cwAAAAAAAw==",
        "AAAAAAAAAAAAAAAPcmVnaXN0ZXJfc2VjcmV0AAAAAAMAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAALc2VjcmV0X2hhc2gAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAARZ2V0X3BsYXllcl9yZXN1bHQAAAAAAAACAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAD6QAAB9AAAAAKR2FtZVJlc3VsdAAAAAAAAw==",
        "AAAAAAAAAAAAAAAUZ2V0X3ZlcmlmaWNhdGlvbl9rZXkAAAAAAAAAAQAAA+gAAAAO",
        "AAAAAAAAAAAAAAAUc2V0X3ZlcmlmaWNhdGlvbl9rZXkAAAABAAAAAAAAAAJ2awAAAAAADgAAAAA=" ]),
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
        initialize: this.txFromJSON<null>,
        start_game: this.txFromJSON<Result<void>>,
        submit_guess: this.txFromJSON<Result<void>>,
        submit_proof: this.txFromJSON<Result<void>>,
        verify_proof: this.txFromJSON<Result<Option<readonly [GameResult, GameResult]>>>,
        has_game_ended: this.txFromJSON<Result<Option<string>>>,
        get_game_status: this.txFromJSON<Result<GameStatus>>,
        register_secret: this.txFromJSON<Result<void>>,
        get_player_result: this.txFromJSON<Result<GameResult>>,
        get_verification_key: this.txFromJSON<Option<Buffer>>,
        set_verification_key: this.txFromJSON<null>
  }
}