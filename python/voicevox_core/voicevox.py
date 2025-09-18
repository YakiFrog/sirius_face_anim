#!/usr/bin/env python

"""asyncio版のサンプルコードです。"""

import asyncio
import dataclasses
import logging
import multiprocessing
from argparse import ArgumentParser
from pathlib import Path

from voicevox_core import AccelerationMode
from voicevox_core.asyncio import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile


@dataclasses.dataclass
class Args:
    mode: AccelerationMode
    vvm: Path
    onnxruntime: str
    dict_dir: Path
    text: str
    out: Path
    style_id: int
    speed_scale: float
    pitch_scale: float
    intonation_scale: float

    @staticmethod
    def parse_args() -> "Args":
        argparser = ArgumentParser()
        argparser.add_argument(
            "--mode",
            default="AUTO",
            choices=("AUTO", "CPU", "GPU"),
            help="モード",
        )
        argparser.add_argument(
            "vvm",
            type=Path,
            help="vvmファイルへのパス",
        )
        argparser.add_argument(
            "--onnxruntime",
            default=f"./onnxruntime/lib/{Onnxruntime.LIB_VERSIONED_FILENAME}",
            help="ONNX Runtimeのライブラリのfilename",
        )
        argparser.add_argument(
            "--dict-dir",
            default="./dict/open_jtalk_dic_utf_8-1.11",
            type=Path,
            help="Open JTalkの辞書ディレクトリ",
        )
        argparser.add_argument(
            "--text",
            default="この音声は、ボイスボックスを使用して、出力されています。",
            help="読み上げさせたい文章",
        )
        argparser.add_argument(
            "--out",
            default="./output.wav",
            type=Path,
            help="出力wavファイルのパス",
        )
        argparser.add_argument(
            "--style-id",
            default=69,
            type=int,
            help="話者IDを指定",
        )
        argparser.add_argument(
            "--speed-scale",
            default=0.9,
            type=float,
            help="話速 (1.0が標準)",
        )
        argparser.add_argument(
            "--pitch-scale",
            default=0.08,
            type=float,
            help="音高 (0.0が標準)",
        )
        argparser.add_argument(
            "--intonation-scale",
            default=0.0,
            type=float,
            help="抑揚 (1.0が標準)",
        )
        args = argparser.parse_args()
        return Args(
            args.mode,
            args.vvm,
            args.onnxruntime,
            args.dict_dir,
            args.text,
            args.out,
            args.style_id,
            args.speed_scale,
            args.pitch_scale,
            args.intonation_scale,
        )


async def main() -> None:
    logging.basicConfig(format="[%(levelname)s] %(name)s: %(message)s")
    logger = logging.getLogger(__name__)
    logger.setLevel("DEBUG")
    logging.getLogger("voicevox_core_python_api").setLevel("DEBUG")
    logging.getLogger("voicevox_core").setLevel("DEBUG")

    args = Args.parse_args()

    logger.info("%s", f"Loading ONNX Runtime ({args.onnxruntime=})")
    onnxruntime = await Onnxruntime.load_once(filename=args.onnxruntime)

    logger.debug("%s", f"{onnxruntime.supported_devices()=}")

    logger.info("%s", f"Initializing ({args.mode=}, {args.dict_dir=})")
    synthesizer = Synthesizer(
        onnxruntime,
        await OpenJtalk.new(args.dict_dir),
        acceleration_mode=args.mode,
        cpu_num_threads=max(
            multiprocessing.cpu_count(), 2
        ),  # https://github.com/VOICEVOX/voicevox_core/issues/888
    )
    logger.debug("%s", f"{synthesizer.is_gpu_mode=}")

    logger.info("%s", f"Loading `{args.vvm}`")
    async with await VoiceModelFile.open(args.vvm) as model:
        await synthesizer.load_voice_model(model)
        
    # スタイル情報を詳しく表示
    metas = synthesizer.metas()
    for meta in metas:
        logger.info(f"キャラクター: {meta.name}")
        for style in meta.styles:
            logger.info(f"  スタイル: {style.name} (ID: {style.id})")
            
    # スタイルIDの自動選択
    if args.style_id is None:
        if metas and metas[0].styles:
            args.style_id = metas[0].styles[0].id
            logger.info(f"🎯 スタイルID自動選択: {args.style_id} ({metas[0].styles[0].name})")
        else:
            logger.error("利用可能なスタイルが見つかりません")
            return
    else:
        # 指定されたスタイルIDが存在するかチェック
        available_style_ids = [style.id for meta in metas for style in meta.styles]
        if args.style_id not in available_style_ids:
            logger.error(f"スタイルID {args.style_id} は利用できません。利用可能なID: {available_style_ids}")
            return
        logger.info(f"🎯 指定されたスタイルID: {args.style_id}")
        
    logger.debug("%s", f"{synthesizer.metas()=}")

    logger.info("%s", f"Creating an AudioQuery from {args.text!r}")
    audio_query = await synthesizer.create_audio_query(args.text, args.style_id)

    # 音声パラメータの調整
    logger.info("🎵 音声パラメータ調整:")
    logger.info(f"  BPM(話速): {args.speed_scale}")
    logger.info(f"  ピッチ: {args.pitch_scale}")
    logger.info(f"  抑揚: {args.intonation_scale}")
    
    audio_query.speed_scale = args.speed_scale
    audio_query.pitch_scale = args.pitch_scale
    audio_query.intonation_scale = args.intonation_scale

    logger.info("%s", f"Synthesizing with {audio_query}")
    wav = await synthesizer.synthesis(audio_query, args.style_id)

    args.out.write_bytes(wav)
    logger.info("%s", f"Wrote `{args.out}`")


if __name__ == "__main__":
    asyncio.run(main())