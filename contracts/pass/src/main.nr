use dep::std;

global N: u32 = 3; // 3 digits
global K: u32 = 10; // Digits 0 to 9

fn main(
    secret: [u32; 3],             // Private
    salt: Field,                  // Private
    guess: pub [u32; 3],              // Private input, returned as public
    hash: pub Field,                  // Private input, returned as public
    acertos: pub u32,                 // Private input, returned as public
    permutados: pub u32,              // Private input, returned as public
    erros: pub u32                    // Private input, returned as public
) {
    // 1. Verify Commitment (Secret + Salt)
    // Using Pedersen because Poseidon was not found in std::hash
    let computed_hash = std::hash::pedersen_hash([
        secret[0] as Field, 
        secret[1] as Field, 
        secret[2] as Field, 
        salt
    ]);
    assert(computed_hash == hash);

    // 2. Performant Mastermind Logic (Frequency Counting)
    let mut count_acertos: u32 = 0;
    let mut secret_counts: [u32; 10] = [0; 10];
    let mut guess_counts: [u32; 10] = [0; 10];

    // Identify exact matches and count frequencies for the rest
    for i in 0..N {
        if secret[i] == guess[i] {
            count_acertos += 1;
        } else {
            secret_counts[secret[i]] += 1;
            guess_counts[guess[i]] += 1;
        }
    }

    // Calculate permutations (minimum between frequencies)
    let mut count_permutados: u32 = 0;
    for i in 0..K {
        let sc = secret_counts[i];
        let gc = guess_counts[i];
        count_permutados += if sc < gc { sc } else { gc };
    }

    let count_erros = N - count_acertos - count_permutados;

    // 3. Final Validation
    assert(count_acertos == acertos);
    assert(count_permutados == permutados);
    assert(count_erros == erros);
}