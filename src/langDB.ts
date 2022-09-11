/* eslint-disable @typescript-eslint/naming-convention */


let lang_to_extlist: { [key: string]: string[] } = {
    // C-like
    "C": [".c", ".h"],
    "C++": [".cpp", ".cc", ".cxx", ".c++", ".hpp", ".hxx", ".hh", ".h++"],
    "Assembly": [".asm", ".s"],
    "FORTRAN": [".f", ".f90", ".f95", ".f03", ".f08", ".f77", ".f03", ".f08", ".fpp", ".for", ".ftn", ".ftn95", ".f95", ".f03", ".f08"],
    // Java-like
    "Java": [".java"],
    "C#": [".cs"],
    "Scala": [".scala"],
    "Groovy": [".groovy"],
    "Kotlin": [".kt", ".kts"],
    // Javascript or web
    "JavaScript": [".js"],
    "TypeScript": [".ts"],
    "SQL": [".sql"],
    "PHP": [".php"],
    // Python
    "Python": [".py", ".pyw", ".pyx"],
    // Non-python Interpreted
    "Perl": [".pl", ".pm", ".t"],
    "Visual Basic": [".vb"],
    "Haskell": [".hs"],
    "Ruby": [".rb"],
    // Non-C compiled
    "Rust": [".rs"],
    "GO": [".go"],
    "Julia": [".jl"],
    "Lua": [".lua"],
    // Text
    "TeX": [".tex"],
    "HTML": [".html", ".htm"],
    "Markdown": [".md", ".markdown"],
    "CSS": [".css"],
    // Weird
    "Dockerfile": ["Dockerfile", ".dockerfile"],
    "PowerShell": [".ps1"],
    "Makefile": ["Makefile", ".mk", ".mak"],
    "Batchfile": [".bat", ".cmd"],
    "CMake": [".cmake"],
    "Shell": [".sh", ".bash", ".zsh"],
};


export function language_from_filename(filename: string): string
{
    let ext = filename.split(".");
    let name_or_ext;
    if (ext.length > 1) {
        name_or_ext = "." + ext[ext.length - 1];
    } else {
        name_or_ext = filename;
    }
    for (let lang in lang_to_extlist) {
        if (lang_to_extlist[lang].includes(name_or_ext)) {
            return lang;
        }
    }
    return "Unknown";
}
